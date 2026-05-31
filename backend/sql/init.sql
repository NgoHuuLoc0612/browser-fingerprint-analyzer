-- Browser Fingerprint Analyzer — PostgreSQL Schema
-- Compatible with EDB (EnterpriseDB) and standard PostgreSQL 14+

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Main fingerprint scans table
CREATE TABLE IF NOT EXISTS fingerprint_scans (
    id                  BIGSERIAL PRIMARY KEY,
    visitor_id          TEXT        NOT NULL,
    session_id          TEXT        NOT NULL,
    stable_hash         TEXT        NOT NULL,
    fingerprint_hash    TEXT        NOT NULL,
    browser_name        TEXT,
    browser_version     TEXT,
    os_name             TEXT,
    os_version          TEXT,
    gpu_renderer        TEXT,
    gpu_vendor          TEXT,
    entropy_bits        DOUBLE PRECISION DEFAULT 0,
    uniqueness_percent  DOUBLE PRECISION DEFAULT 0,
    risk_score          DOUBLE PRECISION DEFAULT 0,
    anomaly_score       DOUBLE PRECISION DEFAULT 0,
    is_anomaly          BOOLEAN          DEFAULT false,
    is_new_identity     BOOLEAN          DEFAULT true,
    flags               JSONB            DEFAULT '[]'::jsonb,
    vector_json         JSONB            DEFAULT '[]'::jsonb,
    ip_address          INET,
    user_agent_hash     TEXT,
    scanned_at          TIMESTAMPTZ      DEFAULT NOW(),
    created_at          TIMESTAMPTZ      DEFAULT NOW(),
    UNIQUE(session_id)
);

-- ── Indices
CREATE INDEX IF NOT EXISTS idx_fp_stable_hash       ON fingerprint_scans(stable_hash);
CREATE INDEX IF NOT EXISTS idx_fp_visitor_id        ON fingerprint_scans(visitor_id);
CREATE INDEX IF NOT EXISTS idx_fp_fingerprint_hash  ON fingerprint_scans(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_fp_scanned_at        ON fingerprint_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_fp_is_anomaly        ON fingerprint_scans(is_anomaly) WHERE is_anomaly = true;
CREATE INDEX IF NOT EXISTS idx_fp_risk_score        ON fingerprint_scans(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_fp_entropy           ON fingerprint_scans(entropy_bits DESC);
CREATE INDEX IF NOT EXISTS idx_fp_browser           ON fingerprint_scans(browser_name, browser_version);
CREATE INDEX IF NOT EXISTS idx_fp_os                ON fingerprint_scans(os_name);
CREATE INDEX IF NOT EXISTS idx_fp_flags             ON fingerprint_scans USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_fp_vector            ON fingerprint_scans USING gin(vector_json);

-- ── Identity graph (CSR-like adjacency stored in Postgres)
CREATE TABLE IF NOT EXISTS identity_graph (
    id          BIGSERIAL PRIMARY KEY,
    src_hash    TEXT        NOT NULL,
    dst_hash    TEXT        NOT NULL,
    similarity  DOUBLE PRECISION DEFAULT 0,
    edge_type   TEXT        DEFAULT 'cosine',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(src_hash, dst_hash)
);
CREATE INDEX IF NOT EXISTS idx_ig_src ON identity_graph(src_hash);
CREATE INDEX IF NOT EXISTS idx_ig_dst ON identity_graph(dst_hash);
CREATE INDEX IF NOT EXISTS idx_ig_sim ON identity_graph(similarity DESC);

-- ── Entropy clusters (k-means result snapshots)
CREATE TABLE IF NOT EXISTS entropy_clusters (
    id              BIGSERIAL PRIMARY KEY,
    cluster_id      TEXT        NOT NULL UNIQUE,
    centroid        JSONB       NOT NULL,
    member_count    INTEGER     DEFAULT 0,
    avg_entropy     DOUBLE PRECISION DEFAULT 0,
    avg_anomaly     DOUBLE PRECISION DEFAULT 0,
    cms_estimate    INTEGER     DEFAULT 0,
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ec_cluster_id ON entropy_clusters(cluster_id);

-- ── Anomaly log
CREATE TABLE IF NOT EXISTS anomaly_log (
    id                      BIGSERIAL PRIMARY KEY,
    scan_id                 BIGINT      REFERENCES fingerprint_scans(id) ON DELETE CASCADE,
    visitor_id              TEXT        NOT NULL,
    reconstruction_error    DOUBLE PRECISION,
    threshold               DOUBLE PRECISION,
    anomaly_label           TEXT,
    anomaly_dimensions      JSONB       DEFAULT '[]'::jsonb,
    confidence              DOUBLE PRECISION,
    logged_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_al_visitor   ON anomaly_log(visitor_id);
CREATE INDEX IF NOT EXISTS idx_al_label     ON anomaly_log(anomaly_label);
CREATE INDEX IF NOT EXISTS idx_al_logged_at ON anomaly_log(logged_at DESC);

-- ── Daily aggregate stats view
CREATE OR REPLACE VIEW daily_stats AS
SELECT
    DATE_TRUNC('day', scanned_at)   AS day,
    COUNT(*)                         AS total_scans,
    COUNT(DISTINCT stable_hash)      AS unique_fingerprints,
    COUNT(DISTINCT visitor_id)       AS unique_visitors,
    SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) AS anomaly_count,
    AVG(entropy_bits)                AS avg_entropy,
    AVG(risk_score)                  AS avg_risk,
    AVG(uniqueness_percent)          AS avg_uniqueness
FROM fingerprint_scans
GROUP BY DATE_TRUNC('day', scanned_at)
ORDER BY day DESC;

-- ── Browser distribution view
CREATE OR REPLACE VIEW browser_distribution AS
SELECT
    browser_name,
    browser_version,
    COUNT(*)            AS scan_count,
    AVG(entropy_bits)   AS avg_entropy,
    AVG(risk_score)     AS avg_risk,
    SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) AS anomalies
FROM fingerprint_scans
WHERE scanned_at > NOW() - INTERVAL '30 days'
GROUP BY browser_name, browser_version
ORDER BY scan_count DESC;

-- ── Risk distribution function
CREATE OR REPLACE FUNCTION get_risk_distribution()
RETURNS TABLE(bucket TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN risk_score < 0.25 THEN 'low'
            WHEN risk_score < 0.50 THEN 'medium'
            WHEN risk_score < 0.75 THEN 'high'
            ELSE 'critical'
        END AS bucket,
        COUNT(*) AS count
    FROM fingerprint_scans
    WHERE scanned_at > NOW() - INTERVAL '7 days'
    GROUP BY bucket
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- ── Nearest neighbors function (approximate, for identity graph)
CREATE OR REPLACE FUNCTION find_similar_fingerprints(
    target_hash TEXT,
    limit_n     INTEGER DEFAULT 10
)
RETURNS TABLE(
    stable_hash     TEXT,
    browser_name    TEXT,
    os_name         TEXT,
    entropy_bits    DOUBLE PRECISION,
    risk_score      DOUBLE PRECISION,
    scanned_at      TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (fp.stable_hash)
        fp.stable_hash,
        fp.browser_name,
        fp.os_name,
        fp.entropy_bits,
        fp.risk_score,
        fp.scanned_at
    FROM fingerprint_scans fp
    WHERE fp.stable_hash != target_hash
      AND fp.scanned_at > NOW() - INTERVAL '90 days'
    ORDER BY fp.stable_hash, fp.scanned_at DESC
    LIMIT limit_n;
END;
$$ LANGUAGE plpgsql;

-- ── Partition fingerprint_scans by month (for large deployments)
-- Uncomment for production high-volume deployments:
-- ALTER TABLE fingerprint_scans PARTITION BY RANGE (scanned_at);
-- CREATE TABLE fingerprint_scans_y2024m01 PARTITION OF fingerprint_scans
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Seed default cluster definitions
INSERT INTO entropy_clusters (cluster_id, centroid, member_count, avg_entropy)
VALUES
    ('cluster_0', '[0.1,0.1,0.5,0.5,0.3,0.1,0.0,0.2,0.1,0.9,0.85,0.85,0.4,0.1,0.5,0.3]', 0, 8.0),
    ('cluster_1', '[0.3,0.2,0.75,0.75,0.5,0.25,0.0,0.3,0.15,0.9,0.85,0.85,0.5,0.9,0.5,0.5]', 0, 12.0),
    ('cluster_2', '[0.5,0.4,1.0,1.0,0.75,0.5,0.0,0.5,0.3,0.9,0.85,0.1,0.6,0.1,0.5,0.4]', 0, 10.0),
    ('cluster_3', '[0.2,0.15,0.5,0.5,0.25,0.13,1.0,0.2,0.05,0.1,0.1,0.85,0.3,0.1,0.7,0.2]', 0, 6.0),
    ('cluster_4', '[0.7,0.6,1.0,1.0,1.0,1.0,0.0,0.6,0.5,0.9,0.85,0.85,0.8,0.9,0.5,0.8]', 0, 18.0),
    ('cluster_5', '[0.4,0.3,0.5,0.5,0.5,0.5,0.0,0.15,0.0,0.9,0.1,0.85,0.5,0.1,0.5,0.1]', 0, 9.0),
    ('cluster_6', '[0.3,0.25,0.25,1.0,0.25,0.13,0.3,0.1,0.0,0.9,0.85,0.85,0.2,0.9,0.3,0.4]', 0, 7.0),
    ('cluster_7', '[0.9,0.8,2.0,1.0,0.75,0.5,0.0,0.7,0.7,0.9,0.85,0.85,1.0,0.9,0.5,0.9]', 0, 22.0)
ON CONFLICT (cluster_id) DO NOTHING;

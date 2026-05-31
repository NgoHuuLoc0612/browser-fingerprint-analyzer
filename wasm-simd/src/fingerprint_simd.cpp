#include <emscripten/emscripten.h>
#include <emscripten/bind.h>
#include <wasm_simd128.h>
#include <cmath>
#include <cstring>
#include <cstdint>
#include <cstdlib>
#include <vector>
#include <algorithm>
#include <numeric>
#include <random>
#include <limits>
#include <string>

// -- SIMD Cosine Similarity
extern "C" EMSCRIPTEN_KEEPALIVE
float cosine_similarity_simd(const float* a, const float* b, int n) {
    v128_t dot=wasm_f32x4_splat(0),na=wasm_f32x4_splat(0),nb=wasm_f32x4_splat(0);
    int i=0;
    for(;i+3<n;i+=4){
        v128_t va=wasm_v128_load(a+i),vb=wasm_v128_load(b+i);
        dot=wasm_f32x4_add(dot,wasm_f32x4_mul(va,vb));
        na=wasm_f32x4_add(na,wasm_f32x4_mul(va,va));
        nb=wasm_f32x4_add(nb,wasm_f32x4_mul(vb,vb));
    }
    float tmp[4],d=0,sa=0,sb=0;
    wasm_v128_store(tmp,dot); d=tmp[0]+tmp[1]+tmp[2]+tmp[3];
    wasm_v128_store(tmp,na);  sa=tmp[0]+tmp[1]+tmp[2]+tmp[3];
    wasm_v128_store(tmp,nb);  sb=tmp[0]+tmp[1]+tmp[2]+tmp[3];
    for(;i<n;i++){d+=a[i]*b[i];sa+=a[i]*a[i];sb+=b[i]*b[i];}
    float den=sqrtf(sa)*sqrtf(sb);
    return den<1e-10f?0.f:d/den;
}

// -- L2 Distance
extern "C" EMSCRIPTEN_KEEPALIVE
float l2_distance_simd(const float* a, const float* b, int n) {
    v128_t acc=wasm_f32x4_splat(0);
    int i=0;
    for(;i+3<n;i+=4){v128_t d=wasm_f32x4_sub(wasm_v128_load(a+i),wasm_v128_load(b+i));acc=wasm_f32x4_add(acc,wasm_f32x4_mul(d,d));}
    float tmp[4]; wasm_v128_store(tmp,acc);
    float s=tmp[0]+tmp[1]+tmp[2]+tmp[3];
    for(;i<n;i++){float d=a[i]-b[i];s+=d*d;}
    return sqrtf(s);
}

// -- Count-Min Sketch
#define CMS_D 4
#define CMS_W 2048
struct CMS {
    uint32_t t[CMS_D][CMS_W]={};
    uint32_t seeds[CMS_D]={0x3f16a3b1u,0x6d2e4f7cu,0xa1b9c3d5u,0xf7e6d2c1u};
    uint32_t h(const char* d,size_t l,uint32_t seed) const {
        uint32_t x=seed^2166136261u;
        for(size_t i=0;i<l;i++){x^=(uint8_t)d[i];x*=16777619u;}
        return x%CMS_W;
    }
    void insert(const char* item,size_t l){for(int d=0;d<CMS_D;d++){uint32_t i=h(item,l,seeds[d]);if(t[d][i]<UINT32_MAX)t[d][i]++;}}
    uint32_t query(const char* item,size_t l) const {uint32_t m=UINT32_MAX;for(int d=0;d<CMS_D;d++)m=std::min(m,t[d][h(item,l,seeds[d])]);return m==UINT32_MAX?0:m;}
    void clear(){memset(t,0,sizeof(t));}
} g_sketch;

extern "C" EMSCRIPTEN_KEEPALIVE void cms_insert(const char* item,int l){g_sketch.insert(item,l);}
extern "C" EMSCRIPTEN_KEEPALIVE uint32_t cms_query(const char* item,int l){return g_sketch.query(item,l);}
extern "C" EMSCRIPTEN_KEEPALIVE void cms_clear(){g_sketch.clear();}

// -- Shannon Entropy
extern "C" EMSCRIPTEN_KEEPALIVE
float compute_entropy(const float* v,int n){
    float total=0;for(int i=0;i<n;i++)total+=v[i];
    if(total<1e-10f)return 0;
    float h=0;for(int i=0;i<n;i++){if(v[i]<=0)continue;float p=v[i]/total;h-=p*log2f(p);}
    return h;
}

// -- k-means++
extern "C" EMSCRIPTEN_KEEPALIVE
void kmeans_cluster(const float* data,int n,int dim,int k,int max_iter,float* cout,int* aout){
    if(n<=0||dim<=0||k<=0)return;
    k=std::min(k,n);
    std::vector<std::vector<float>> centroids(k,std::vector<float>(dim));
    std::vector<int> asgn(n,0);
    std::mt19937 rng(42);
    std::uniform_int_distribution<int> ri(0,n-1);
    int first=ri(rng);
    for(int d=0;d<dim;d++)centroids[0][d]=data[first*dim+d];
    std::vector<float> dist2(n,std::numeric_limits<float>::max());
    for(int c=1;c<k;c++){
        float td=0;
        for(int i=0;i<n;i++){float d=l2_distance_simd(data+i*dim,centroids[c-1].data(),dim);d*=d;dist2[i]=std::min(dist2[i],d);td+=dist2[i];}
        std::uniform_real_distribution<float> rw(0,td);float tgt=rw(rng),acc=0;int ch=0;
        for(int i=0;i<n;i++){acc+=dist2[i];if(acc>=tgt){ch=i;break;}}
        for(int d=0;d<dim;d++)centroids[c][d]=data[ch*dim+d];
    }
    for(int iter=0;iter<max_iter;iter++){
        bool changed=false;
        for(int i=0;i<n;i++){float bd=std::numeric_limits<float>::max();int bc=0;for(int c=0;c<k;c++){float d=l2_distance_simd(data+i*dim,centroids[c].data(),dim);if(d<bd){bd=d;bc=c;}}if(asgn[i]!=bc){asgn[i]=bc;changed=true;}}
        if(!changed)break;
        std::vector<std::vector<float>> nc(k,std::vector<float>(dim,0));std::vector<int> cnt(k,0);
        for(int i=0;i<n;i++){int c=asgn[i];cnt[c]++;for(int d=0;d<dim;d++)nc[c][d]+=data[i*dim+d];}
        for(int c=0;c<k;c++)if(cnt[c]>0){for(int d=0;d<dim;d++)nc[c][d]/=cnt[c];centroids[c]=nc[c];}
    }
    for(int c=0;c<k;c++)for(int d=0;d<dim;d++)cout[c*dim+d]=centroids[c][d];
    for(int i=0;i<n;i++)aout[i]=asgn[i];
}

// -- CSR Graph
struct CSRGraph{std::vector<int> rp,ci;std::vector<float> w;int n=0;} g_graph;
extern "C" EMSCRIPTEN_KEEPALIVE
void csr_build(const int* edges,const float* weights,int ne,int nn){
    g_graph.n=nn;g_graph.rp.assign(nn+1,0);g_graph.ci.clear();g_graph.w.clear();
    for(int i=0;i<ne;i++){int s=edges[i*2];if(s>=0&&s<nn)g_graph.rp[s+1]++;}
    for(int i=1;i<=nn;i++)g_graph.rp[i]+=g_graph.rp[i-1];
    g_graph.ci.resize(ne);g_graph.w.resize(ne);
    std::vector<int> pos(g_graph.rp.begin(),g_graph.rp.begin()+nn);
    for(int i=0;i<ne;i++){int s=edges[i*2],dst=edges[i*2+1];if(s>=0&&s<nn){int p=pos[s]++;g_graph.ci[p]=dst;g_graph.w[p]=weights[i];}}
}
extern "C" EMSCRIPTEN_KEEPALIVE
int csr_bfs(int start,int depth,int* on,float* os,int maxr){
    if(g_graph.n==0||start<0||start>=g_graph.n)return 0;
    std::vector<bool> vis(g_graph.n,false);
    std::vector<std::pair<int,int>> q;q.push_back({start,0});vis[start]=true;
    int rc=0;size_t qh=0;
    while(qh<q.size()&&rc<maxr){
        auto[node,d]=q[qh++];on[rc]=node;os[rc]=1.f/(1.f+d);rc++;
        if(d>=depth)continue;
        for(int e=g_graph.rp[node];e<g_graph.rp[node+1];e++){int nb=g_graph.ci[e];if(nb>=0&&nb<g_graph.n&&!vis[nb]){vis[nb]=true;q.push_back({nb,d+1});}}
    }
    return rc;
}

// -- EMA
extern "C" EMSCRIPTEN_KEEPALIVE
void ema_update(const float* nv,const float* ov,float* out,int n,float alpha){
    float om=1.f-alpha;
    v128_t a=wasm_f32x4_splat(alpha),b=wasm_f32x4_splat(om);
    int i=0;
    for(;i+3<n;i+=4)wasm_v128_store(out+i,wasm_f32x4_add(wasm_f32x4_mul(a,wasm_v128_load(nv+i)),wasm_f32x4_mul(b,wasm_v128_load(ov+i))));
    for(;i<n;i++)out[i]=alpha*nv[i]+om*ov[i];
}

// -- MLP
static const int IN=16,H1=128,H2=64,H3=32;
struct MLP{float W1[H1][IN],b1[H1],W2[H2][H1],b2[H2],W3[H3][H2],b3[H3],W4[1][H3],b4[1],g1[H1],bt1[H1];bool ok=false;} g_mlp;
inline float relu(float x){return x>0?x:0;}
inline float sigmoid(float x){return 1.f/(1.f+expf(-x));}
void init_mlp(){
    if(g_mlp.ok)return;
    std::mt19937 rng(0xBEEFCAFE);
    auto xavier=[&](float* w,int fi,int fo,int n){float s=sqrtf(2.f/(fi+fo));std::normal_distribution<float> d(0,s);for(int i=0;i<n;i++)w[i]=d(rng);};
    xavier(&g_mlp.W1[0][0],IN,H1,H1*IN);xavier(&g_mlp.W2[0][0],H1,H2,H2*H1);
    xavier(&g_mlp.W3[0][0],H2,H3,H3*H2);xavier(&g_mlp.W4[0][0],H3,1,H3);
    memset(g_mlp.b1,0,sizeof(g_mlp.b1));memset(g_mlp.b2,0,sizeof(g_mlp.b2));
    memset(g_mlp.b3,0,sizeof(g_mlp.b3));g_mlp.b4[0]=0;
    std::fill(g_mlp.g1,g_mlp.g1+H1,1.f);std::fill(g_mlp.bt1,g_mlp.bt1+H1,0.f);
    g_mlp.ok=true;
}
void layer_norm(float* x,const float* g,const float* bt,int n){
    float mean=0,var=0;for(int i=0;i<n;i++)mean+=x[i];mean/=n;
    for(int i=0;i<n;i++){float d=x[i]-mean;var+=d*d;}var=var/n+1e-5f;float is=1.f/sqrtf(var);
    for(int i=0;i<n;i++)x[i]=g[i]*(x[i]-mean)*is+bt[i];
}
void dense_relu(const float* in,float* out,const float* W,const float* b,int is,int os){
    for(int o=0;o<os;o++){
        float acc=b[o];int i=0;v128_t va=wasm_f32x4_splat(0);const float* row=W+o*is;
        for(;i+3<is;i+=4)va=wasm_f32x4_add(va,wasm_f32x4_mul(wasm_v128_load(in+i),wasm_v128_load(row+i)));
        float tmp[4];wasm_v128_store(tmp,va);acc+=tmp[0]+tmp[1]+tmp[2]+tmp[3];
        for(;i<is;i++)acc+=in[i]*row[i];
        out[o]=relu(acc);
    }
}
extern "C" EMSCRIPTEN_KEEPALIVE
float mlp_forward(const float* input,int n){
    init_mlp();
    float inp[IN]={};for(int i=0;i<std::min(n,IN);i++)inp[i]=input[i];
    float h1[H1],h2[H2],h3[H3],h3r[H3];
    dense_relu(inp,h1,&g_mlp.W1[0][0],g_mlp.b1,IN,H1);
    layer_norm(h1,g_mlp.g1,g_mlp.bt1,H1);
    dense_relu(h1,h2,&g_mlp.W2[0][0],g_mlp.b2,H1,H2);
    dense_relu(h2,h3,&g_mlp.W3[0][0],g_mlp.b3,H2,H3);
    for(int i=0;i<H3;i++)h3r[i]=relu(h3[i]+h2[i]);
    float acc=g_mlp.b4[0];for(int i=0;i<H3;i++)acc+=h3r[i]*g_mlp.W4[0][i];
    return sigmoid(acc);
}

// -- Bindings (Emscripten 5.x — no raw pointers in Embind)
EMSCRIPTEN_BINDINGS(fp) {
    emscripten::function("cosineSimilarityJS",emscripten::optional_override([](emscripten::val a,emscripten::val b)->float{
        int n=a["length"].as<int>();std::vector<float> va(n),vb(n);
        for(int i=0;i<n;i++){va[i]=a[i].as<float>();vb[i]=b[i].as<float>();}
        return cosine_similarity_simd(va.data(),vb.data(),n);
    }));
    emscripten::function("l2DistanceJS",emscripten::optional_override([](emscripten::val a,emscripten::val b)->float{
        int n=a["length"].as<int>();std::vector<float> va(n),vb(n);
        for(int i=0;i<n;i++){va[i]=a[i].as<float>();vb[i]=b[i].as<float>();}
        return l2_distance_simd(va.data(),vb.data(),n);
    }));
    emscripten::function("cmsInsert",emscripten::optional_override([](const std::string& s){g_sketch.insert(s.c_str(),s.size());}));
    emscripten::function("cmsQuery",emscripten::optional_override([](const std::string& s)->uint32_t{return g_sketch.query(s.c_str(),s.size());}));
    emscripten::function("cmsClear",&cms_clear);
    emscripten::function("computeEntropyJS",emscripten::optional_override([](emscripten::val a)->float{
        int n=a["length"].as<int>();std::vector<float> v(n);for(int i=0;i<n;i++)v[i]=a[i].as<float>();
        return compute_entropy(v.data(),n);
    }));
    emscripten::function("mlpForward",emscripten::optional_override([](emscripten::val a)->float{
        int n=a["length"].as<int>();std::vector<float> v(n);for(int i=0;i<n;i++)v[i]=a[i].as<float>();
        return mlp_forward(v.data(),n);
    }));
    emscripten::function("emaUpdateJS",emscripten::optional_override([](emscripten::val nv,emscripten::val ov,float alpha)->emscripten::val{
        int n=nv["length"].as<int>();std::vector<float> a(n),b(n),out(n);
        for(int i=0;i<n;i++){a[i]=nv[i].as<float>();b[i]=ov[i].as<float>();}
        ema_update(a.data(),b.data(),out.data(),n,alpha);
        emscripten::val r=emscripten::val::array();for(int i=0;i<n;i++)r.call<void>("push",out[i]);return r;
    }));
    emscripten::function("kmeansJS",emscripten::optional_override([](emscripten::val fd,int n,int dim,int k,int mi)->emscripten::val{
        std::vector<float> data(n*dim);for(int i=0;i<n*dim;i++)data[i]=fd[i].as<float>();
        std::vector<float> cent(k*dim);std::vector<int> asgn(n);
        kmeans_cluster(data.data(),n,dim,k,mi,cent.data(),asgn.data());
        emscripten::val r=emscripten::val::object(),ca=emscripten::val::array(),aa=emscripten::val::array();
        for(int i=0;i<k*dim;i++)ca.call<void>("push",cent[i]);
        for(int i=0;i<n;i++)aa.call<void>("push",asgn[i]);
        r.set("centroids",ca);r.set("assignments",aa);return r;
    }));
}
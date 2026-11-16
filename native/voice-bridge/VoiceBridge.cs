// Native Messaging host. No listener socket, shell commands, or arbitrary URLs.
// Protocol v1; stdout contains length-prefixed UTF-8 JSON only.
using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Web.Script.Serialization;

internal sealed class VoiceBridge {
  const int Version = 1, MaxFrame = 65536, MaxPending = 32, MaxWorkers = 24, MaxAudio = 2097152;
#if VOICE_BRIDGE_TEST
  const int EnginePort = 50161;
#else
  const int EnginePort = 50021;
#endif
  static readonly object OutputLock = new object(), JobsLock = new object();
  static readonly Dictionary<string, Job> Jobs = new Dictionary<string, Job>();
  static readonly List<Task> Tasks = new List<Task>();
  static readonly SemaphoreSlim Workers = new SemaphoreSlim(MaxWorkers);
  static long UncertainUntil;
  static bool EngineBusy() { return Interlocked.Read(ref UncertainUntil)>Stopwatch.GetTimestamp(); }
  static void HoldEngine() { Interlocked.Exchange(ref UncertainUntil,Stopwatch.GetTimestamp()+75L*Stopwatch.Frequency); }
  static readonly HttpClient Http = MakeHttp();
  static Stream Output;
  sealed class Job { public string Id, Text; public int Speaker, Rate; public double Speed, Pitch; public volatile bool Cancelled; }
  sealed class BridgeError : Exception {
    public readonly string Code, Phase; public readonly int Status; public readonly bool Complete;
    public BridgeError(string code, string phase, int status, bool complete) { Code=code; Phase=phase; Status=status; Complete=complete; }
  }
  static HttpClient MakeHttp() {
    ServicePointManager.DefaultConnectionLimit = MaxWorkers;
    var handler = new HttpClientHandler { AllowAutoRedirect=false, UseProxy=false };
    var client = new HttpClient(handler); client.Timeout = Timeout.InfiniteTimeSpan; client.MaxResponseContentBufferSize = MaxAudio; client.DefaultRequestHeaders.UserAgent.ParseAdd("KimitoLink-VoiceBridge/1"); return client;
  }
  static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength=MaxAudio, RecursionLimit=24 }; }
  static Dictionary<string,object> Obj(params object[] fields) {
    var value=new Dictionary<string,object>(); for(int i=0;i<fields.Length;i+=2)value.Add((string)fields[i],fields[i+1]);return value;
  }
  static void Send(Dictionary<string,object> value) {
    value["v"]=Version; var bytes=new UTF8Encoding(false,true).GetBytes(Json().Serialize(value));
    if(bytes.Length > 262144)throw new InvalidDataException("output-frame-limit");
    var header=BitConverter.GetBytes(bytes.Length);
    lock(OutputLock) { Output.Write(header,0,4);Output.Write(bytes,0,bytes.Length);Output.Flush(); }
  }
  static byte[] ReadFrame(Stream input) {
    var header=new byte[4];int first=input.ReadByte();if(first<0)return null;header[0]=(byte)first;
    ReadExactly(input,header,1,3);int length=BitConverter.ToInt32(header,0);
    if(length<2 || length>MaxFrame)throw new InvalidDataException("input-frame-limit");
    var bytes=new byte[length];ReadExactly(input,bytes,0,length);return bytes;
  }
  static void ReadExactly(Stream input,byte[] bytes,int offset,int count) {
    while(count>0){int n=input.Read(bytes,offset,count);if(n<=0)throw new EndOfStreamException();offset+=n;count-=n;}
  }
  static string StringField(Dictionary<string,object> d,string key,int maximum) {
    object value;if(!d.TryGetValue(key,out value)||!(value is string))throw new InvalidDataException("invalid-"+key);
    var s=(string)value;if(s.Length==0 || s.Length>maximum)throw new InvalidDataException("invalid-"+key);return s;
  }
  static double NumberField(Dictionary<string,object> d,string key,double min,double max,double fallback) {
    object value;if(!d.TryGetValue(key,out value))return fallback;
    if(!(value is int || value is long || value is double || value is decimal))throw new InvalidDataException("invalid-"+key);
    double n=Convert.ToDouble(value);if(Double.IsNaN(n)||Double.IsInfinity(n)||n<min||n>max)throw new InvalidDataException("invalid-"+key);return n;
  }
  static int IntField(Dictionary<string,object> d,string key,int min,int max,int fallback) {
    double n=NumberField(d,key,min,max,fallback);if(n!=Math.Floor(n))throw new InvalidDataException("invalid-"+key);return (int)n;
  }
  static string IdField(Dictionary<string,object> d) {
    var id=StringField(d,"id",64);foreach(char c in id)if(!Char.IsLetterOrDigit(c)&&c!='-'&&c!='_'&&c!=':'&&c!='.')throw new InvalidDataException("invalid-id");return id;
  }
  static void Error(string id,string code,string phase,int status,bool complete) {
    Send(Obj("type","error","id",id,"code",code,"phase",phase,"status",status,"complete",complete));
  }
  static bool ValidWav(byte[] bytes,int rate) {
    if(bytes.Length<44||bytes.Length>MaxAudio||Encoding.ASCII.GetString(bytes,0,4)!="RIFF"||Encoding.ASCII.GetString(bytes,8,4)!="WAVE"||BitConverter.ToUInt32(bytes,4)!=bytes.Length-8)return false;
    int offset=12;bool format=false,audio=false;
    while(offset+8<=bytes.Length) {
      uint size=BitConverter.ToUInt32(bytes,offset+4);long end=(long)offset+8+size,padded=end+(size%2);
      if(padded>bytes.Length)return false;
      int start=offset+8;string tag=Encoding.ASCII.GetString(bytes,offset,4);
      if(tag=="fmt ") {
        if(format||size<16||BitConverter.ToUInt16(bytes,start)!=1||BitConverter.ToUInt16(bytes,start+2)!=1||BitConverter.ToUInt32(bytes,start+4)!=rate||BitConverter.ToUInt32(bytes,start+8)!=rate*2||BitConverter.ToUInt16(bytes,start+12)!=2||BitConverter.ToUInt16(bytes,start+14)!=16)return false;
        format=true;
      }else if(tag=="data"){if(audio||size<2||size%2!=0)return false;audio=true;}
      offset=(int)padded;
    }
    return offset==bytes.Length&&format&&audio;
  }
  static async Task<HttpResponseMessage> Post(string endpoint,HttpContent body,int timeoutMs,string phase) {
    // endpoint is constructed internally; frame data can never choose host, port or route.
    using(var cancel=new CancellationTokenSource(timeoutMs)) {
      try {
        using(var request=new HttpRequestMessage(HttpMethod.Post,"http://127.0.0.1:"+EnginePort+endpoint)) {
          request.Content=body;
          return await Http.SendAsync(request,HttpCompletionOption.ResponseContentRead,cancel.Token).ConfigureAwait(false);
        }
      }catch(OperationCanceledException){throw new BridgeError("timeout",phase,0,false);}
      catch(HttpRequestException){throw new BridgeError("unreachable",phase,0,false);}
    }
  }
  static async Task RunJob(Job job) {
    await Workers.WaitAsync().ConfigureAwait(false);
    try {
      if(job.Cancelled){Error(job.Id,"cancelled","query",499,true);return;}
      if(EngineBusy()){Error(job.Id,"engine-busy","query",429,true);return;}
      var watch=Stopwatch.StartNew();double queryMs;
      Dictionary<string,object> query;
      using(var response=await Post("/audio_query?text="+Uri.EscapeDataString(job.Text)+"&speaker="+job.Speaker,null,15000,"query")) {
        if(!response.IsSuccessStatusCode)throw new BridgeError("query-http","query",(int)response.StatusCode,true);
        if(response.Content.Headers.ContentLength.GetValueOrDefault()>MaxAudio)throw new BridgeError("query-size","query",0,true);
        var text=await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if(text.Length>MaxAudio)throw new BridgeError("query-size","query",0,true);
        query=Json().DeserializeObject(text) as Dictionary<string,object>;
        if(query==null || !query.ContainsKey("accent_phrases") || !(query["accent_phrases"] is IList))throw new BridgeError("query-shape","query",0,true);
      }
      queryMs=watch.Elapsed.TotalMilliseconds;
      if(job.Cancelled){Error(job.Id,"cancelled","query",499,true);return;}
      if(EngineBusy()){Error(job.Id,"engine-busy","query",429,true);return;}
      double baseSpeed=NumberField(query,"speedScale",0.1,4,1),basePitch=NumberField(query,"pitchScale",-1,1,0);
      query["speedScale"]=Math.Max(0.1,Math.Min(4,baseSpeed+job.Speed));
      query["pitchScale"]=Math.Max(-1,Math.Min(1,basePitch+job.Pitch));
      query["outputSamplingRate"]=job.Rate;query["outputStereo"]=false;
      var content=new StringContent(Json().Serialize(query),Encoding.UTF8,"application/json");
      byte[] wav;
      using(var response=await Post("/synthesis?speaker="+job.Speaker,content,20000,"synth")) {
        if(!response.IsSuccessStatusCode)throw new BridgeError("synth-http","synth",(int)response.StatusCode,true);
        if(response.Content.Headers.ContentLength.GetValueOrDefault()>MaxAudio)throw new BridgeError("audio-size","synth",0,true);
        wav=await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
      }
      if(!ValidWav(wav,job.Rate))throw new BridgeError("audio-shape","synth",0,true);
      Send(Obj("type","audio","id",job.Id,"bytes",wav.Length,"queryMs",queryMs,"synthMs",watch.Elapsed.TotalMilliseconds-queryMs));
      for(int offset=0;offset<wav.Length;offset+=49152)Send(Obj("type","chunk","id",job.Id,"data",Convert.ToBase64String(wav,offset,Math.Min(49152,wav.Length-offset))));
      Send(Obj("type","end","id",job.Id,"bytes",wav.Length,"complete",true));
    }catch(BridgeError error){if(!error.Complete)HoldEngine();TryError(job.Id,error.Code,error.Phase,error.Status,error.Complete);}
    catch(InvalidDataException){TryError(job.Id,"query-shape","query",0,true);}
    catch(ArgumentException){TryError(job.Id,"query-shape","query",0,true);}
    catch(Exception){HoldEngine();TryError(job.Id,"host-failure","synth",0,false);}
    finally{lock(JobsLock){Jobs.Remove(job.Id);}Workers.Release();}
  }
  static void TryError(string id,string code,string phase,int status,bool complete) {try{Error(id,code,phase,status,complete);}catch(IOException){}catch(ObjectDisposedException){} }
  static int Main(string[] args) {
    if(args.Length==0 || (args[0]!="chrome-extension://ohifblceplfkfajfecaoaclmkiahfflm/" && args[0]!="chrome-extension://cjbabignmmodaickpeckiojjabnlogdb/"))return 3;
    Output=Console.OpenStandardOutput();var input=Console.OpenStandardInput();
    try {
      Send(Obj("type","hello","maxInflight",MaxWorkers,"maxPending",MaxPending,"maxAudioBytes",MaxAudio,"enginePort",EnginePort));
      byte[] frame;
      while((frame=ReadFrame(input))!=null) {
        string id="";
        try {
          var value=Json().DeserializeObject(new UTF8Encoding(false,true).GetString(frame)) as Dictionary<string,object>;
          if(value==null)throw new InvalidDataException("object-required");
          id=IdField(value);if(NumberField(value,"v",Version,Version,0)!=Version)throw new InvalidDataException("protocol-version");
          string op=StringField(value,"op",16);
          if(op=="cancel") {lock(JobsLock){Job old;if(Jobs.TryGetValue(id,out old))old.Cancelled=true;}continue;}
          if(op!="synthesize")throw new InvalidDataException("unknown-operation");
          var job=new Job {Id=id,Text=StringField(value,"text",512),Speaker=IntField(value,"speaker",0,100000,3),Rate=IntField(value,"sampleRate",16000,24000,24000),Speed=NumberField(value,"speedOffset",-0.5,2,0),Pitch=NumberField(value,"pitchOffset",-0.3,0.3,0)};
          if(job.Rate!=16000 && job.Rate!=24000)throw new InvalidDataException("sample-rate");
          bool full;
          lock(JobsLock){if(Jobs.ContainsKey(id))throw new InvalidDataException("duplicate-id");full=Jobs.Count>=MaxPending;if(!full)Jobs.Add(id,job);}
          if(full){Error(id,"queue-full","query",429,true);continue;}
          var task=RunJob(job);Tasks.RemoveAll(t=>t.IsCompleted);Tasks.Add(task);
        }catch(InvalidDataException error){Error(id,error.Message,"query",400,error.Message!="duplicate-id");}
        catch(ArgumentException){Error(id,"invalid-json","query",400,true);}
      }
      // Disconnect does not stop VOICEVOX. Let already accepted calls finish within their deadlines.
      Task.WaitAll(Tasks.ToArray(),40000);return 0;
    }catch(EndOfStreamException){return 2;}
    catch(InvalidDataException){return 2;}
    catch(IOException){return 0;}
  }
}

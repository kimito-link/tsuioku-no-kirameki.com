// Per-user installer. No administrator, network download, or shell execution.
using System;
using System.IO;
using System.Text;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using Microsoft.Win32;

internal static class VoiceBridgeSetup {
#if VOICE_BRIDGE_TEST
  const string Host="com.kimitolink.voice_bridge_test";
#else
  const string Host="com.kimitolink.voice_bridge";
#endif
  const string Owner="KimitoLink VoiceBridge protocol 1";
  static string RegistryPath { get { return @"Software\Google\Chrome\NativeMessagingHosts\"+Host; } }
  static string Hash(byte[] bytes) { using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
  static string Root(string[] args) {
#if VOICE_BRIDGE_TEST
    if(args.Length<2 || args[0]!="--root")throw new InvalidOperationException("test-root-required");
    var root=Path.GetFullPath(args[1]);
    if(root.IndexOf(Path.DirectorySeparatorChar+".artifacts"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)<0)throw new InvalidOperationException("test-root-outside-artifacts");
    return root;
#else
    return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"KimitoLink","VoiceBridge");
#endif
  }
  static void CheckOwner(string root) {
    var marker=Path.Combine(root,"owner.txt");
    if(!Directory.Exists(root))return;
    if(File.Exists(marker)){if(File.ReadAllText(marker)!=Owner)throw new InvalidOperationException("foreign-install-directory");return;}
    // Only an interrupted first marker write may precede ownership. Preserve all files.
    var expected=Encoding.UTF8.GetBytes(Owner);
    foreach(var file in Directory.GetFileSystemEntries(root)) {
      if(Directory.Exists(file)||!System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(file),@"^\.vb-[a-f0-9]{8}$"))throw new InvalidOperationException("foreign-install-directory");
      var partial=File.ReadAllBytes(file);if(partial.Length>expected.Length)throw new InvalidOperationException("foreign-install-directory");
      for(int i=0;i<partial.Length;i++)if(partial[i]!=expected[i])throw new InvalidOperationException("foreign-install-directory");
    }
  }
  static string InstalledManifest() { using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath))return key==null?null:key.GetValue("") as string; }
  static string Manifest(string root) { return Path.Combine(root,"host.json"); }
  static void CheckRegistry(string root) { var existing=InstalledManifest();if(existing!=null && !String.Equals(existing,Manifest(root),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("foreign-native-registration"); }
  static void WriteNewOrIdentical(string file,byte[] bytes) {
    if(File.Exists(file)) { if(Hash(File.ReadAllBytes(file))!=Hash(bytes))throw new InvalidOperationException("foreign-file:"+Path.GetFileName(file));return; }
    var staging=Path.Combine(Path.GetDirectoryName(file),".vb-"+Guid.NewGuid().ToString("N").Substring(0,8));
    bool created=false;
    try {
      using(var stream=new FileStream(staging,FileMode.CreateNew,FileAccess.Write,FileShare.None)){created=true;stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
      if(Hash(File.ReadAllBytes(staging))!=Hash(bytes))throw new IOException("staging-verification-failed");
      File.Move(staging,file);
    }finally{if(created&&File.Exists(staging))File.Delete(staging);}
  }
  static void Install(string root) {
    CheckOwner(root);CheckRegistry(root);
    byte[] host;
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("VoiceBridge.exe")) {
      if(stream==null || stream.Length>2097152)throw new InvalidDataException("missing-host");
      using(var buffer=new MemoryStream()){stream.CopyTo(buffer);host=buffer.ToArray();}
    }
    var hash=Hash(host);var version=Path.Combine(root,hash);var binary=Path.Combine(version,"VoiceBridge.exe");
    Directory.CreateDirectory(root);WriteNewOrIdentical(Path.Combine(root,"owner.txt"),Encoding.UTF8.GetBytes(Owner));
    Directory.CreateDirectory(version);
    var setupBytes=File.ReadAllBytes(Assembly.GetExecutingAssembly().Location);
    var ledger=new Dictionary<string,string>{{"VoiceBridge.exe",hash},{"VoiceBridgeSetup.exe",Hash(setupBytes)}};
    WriteNewOrIdentical(Path.Combine(version,"files.json"),Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(ledger)));
    WriteNewOrIdentical(binary,host);
    var setup=Path.Combine(version,"VoiceBridgeSetup.exe");WriteNewOrIdentical(setup,setupBytes);
    var origins=new[]{"chrome-extension://ohifblceplfkfajfecaoaclmkiahfflm/","chrome-extension://cjbabignmmodaickpeckiojjabnlogdb/"};
    var manifest=new JavaScriptSerializer().Serialize(new {name=Host,description="KimitoLink local voice bridge",path=binary,type="stdio",allowed_origins=origins});
    var manifestPath=Manifest(root);var temp=manifestPath+".pending-"+Guid.NewGuid().ToString("N");
    var previous=File.Exists(manifestPath)?File.ReadAllBytes(manifestPath):null;
    bool manifestStaged=false;
    try {
      var manifestBytes=Encoding.UTF8.GetBytes(manifest);
      using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){manifestStaged=true;stream.Write(manifestBytes,0,manifestBytes.Length);stream.Flush(true);}
      if(File.Exists(manifestPath))File.Replace(temp,manifestPath,null);else File.Move(temp,manifestPath);
#if !VOICE_BRIDGE_TEST
    using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KimitoLinkVoiceBridge")) {
      key.SetValue("DisplayName","君斗りんく ローカル音声補助アプリ");key.SetValue("Publisher","Kimito-Link Project");
      key.SetValue("UninstallString","\""+setup+"\" --uninstall");key.SetValue("InstallLocation",root);key.SetValue("NoModify",1);key.SetValue("NoRepair",1);
    }
#endif
      // Registration is last. Failed installation keeps the previous manifest usable.
      using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath))key.SetValue("",manifestPath,RegistryValueKind.String);
    }catch {
      if(previous!=null)File.WriteAllBytes(manifestPath,previous);else if(File.Exists(manifestPath))File.Delete(manifestPath);
      throw;
    }finally{if(manifestStaged&&File.Exists(temp))File.Delete(temp);}
    Console.WriteLine("Installed local voice bridge. Enable it in the extension settings.");
  }
  static void Uninstall(string root) {
    CheckOwner(root);CheckRegistry(root);
    // Revoke discovery first; never stop VOICEVOX or running Chrome processes.
    if(InstalledManifest()!=null)Registry.CurrentUser.DeleteSubKey(RegistryPath,false);
#if !VOICE_BRIDGE_TEST
    using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KimitoLinkVoiceBridge")) {
      if(key!=null && String.Equals(key.GetValue("InstallLocation") as string,root,StringComparison.OrdinalIgnoreCase))
        Registry.CurrentUser.DeleteSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KimitoLinkVoiceBridge",false);
    }
#endif
    if(!Directory.Exists(root))return;
    foreach(var dir in Directory.GetDirectories(root)) {
      var name=Path.GetFileName(dir);if(name.Length!=64 || System.Text.RegularExpressions.Regex.IsMatch(name,"[^a-f0-9]"))continue;
      var ledgerFile=Path.Combine(dir,"files.json");if(!File.Exists(ledgerFile))continue;
      Dictionary<string,string> files;try{files=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(ledgerFile));}catch{continue;}
      if(files==null||files.Count!=2||!files.ContainsKey("VoiceBridge.exe")||!files.ContainsKey("VoiceBridgeSetup.exe")||files["VoiceBridge.exe"]!=name)continue;
      foreach(var filename in new[]{"VoiceBridge.exe","VoiceBridgeSetup.exe"}) {
        var file=Path.Combine(dir,filename);
        if(!File.Exists(file))continue;
        if(Hash(File.ReadAllBytes(file))!=files[filename]){Console.WriteLine("Preserved changed file: "+file);continue;}
        try{File.Delete(file);}catch(IOException){Console.WriteLine("A running file remains: "+file);}catch(UnauthorizedAccessException){Console.WriteLine("A running file remains: "+file);}
      }
      if(Directory.GetFileSystemEntries(dir).Length==1)File.Delete(ledgerFile);
      if(Directory.GetFileSystemEntries(dir).Length==0)Directory.Delete(dir,false);
    }
    File.Delete(Path.Combine(root,"host.json"));
    // The installed setup is normally running during uninstall on Windows.
    // Preserve ownership while any locked or unknown file remains, so reinstall works.
    if(Directory.GetFileSystemEntries(root).Length==1 && File.Exists(Path.Combine(root,"owner.txt")))File.Delete(Path.Combine(root,"owner.txt"));
    if(Directory.GetFileSystemEntries(root).Length==0)Directory.Delete(root,false);
    Console.WriteLine("Unregistered local voice bridge. Any running files can be removed after Chrome exits.");
  }
  public static int Main(string[] args) {
    try{var root=Root(args);if(Array.IndexOf(args,"--uninstall")>=0)Uninstall(root);else Install(root);return 0;}
    catch(Exception e){Console.Error.WriteLine("Voice bridge setup: "+e.Message);return 1;}
  }
}

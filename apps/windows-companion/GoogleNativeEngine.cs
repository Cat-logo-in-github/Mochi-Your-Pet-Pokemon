using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
namespace MochiDesktop {
 public sealed class NativeGoogleConfig {
  public string ClientId="",ClientSecret="",GmailMode="all";
  public List<string> CalendarIds=new List<string>{"primary"},GmailSenders=new List<string>();
  public int OffsetMinutes=10,CheckMinutes=1,AllDayHour=9;
  public bool GmailMuted,AllDayReminders=true;
 }
 public sealed class NativeGoogleServiceStatus {public bool Connected;public long LastSyncUtcTicks,NextCheckUtcTicks;public string Error="",Summary="Not connected.",GrantId="";}
 public sealed class NativeGoogleStatus {public NativeGoogleServiceStatus Calendar=new NativeGoogleServiceStatus(),Gmail=new NativeGoogleServiceStatus();public int ScheduledEvents,PollMinutes;public long HorizonEndUtcTicks;public string GmailMode;}
 public sealed class NativeCalendarEvent {public string Key;public long StartUtcTicks,EndUtcTicks;public bool AllDay;}
 public sealed class NativeMailAlert {public string Key;public long ReceivedUtcTicks;public bool Important;}
 public sealed class NativeGoogleBatch {public string CalendarGrantId="",GmailGrantId="";public bool CalendarSnapshotAvailable;public List<NativeCalendarEvent> CalendarEvents=new List<NativeCalendarEvent>();public long HorizonEndUtcTicks;public List<NativeMailAlert> MailAlerts=new List<NativeMailAlert>();}
 public sealed class NativeGoogleException:Exception {public readonly int Status;public NativeGoogleException(int status,string message):base(message){Status=status;}}
 public sealed class NativeGoogleGrant {public string AccessToken="",RefreshToken="",Error="",Summary="Not connected.",GrantId="";public long ExpiresUtcTicks,LastSyncUtcTicks,NextCheckUtcTicks;public int Failures;}
 public sealed class NativeGooglePrivateState {
  public int Version=1;public NativeGoogleConfig Config=new NativeGoogleConfig();
  public NativeGoogleGrant Calendar=new NativeGoogleGrant(),Gmail=new NativeGoogleGrant();
  public bool CalendarSnapshotAvailable;public List<NativeCalendarEvent> CalendarEvents=new List<NativeCalendarEvent>();public long HorizonEndUtcTicks;
  public string HistoryId,PendingCursor;public long GmailBaselineUtcTicks;public List<string> Seen=new List<string>(),PendingIds=new List<string>();public List<NativeMailAlert> Outbox=new List<NativeMailAlert>();
 }
 public static class NativeGoogleSecurity {
  public static string Base64Url(byte[] value){return Convert.ToBase64String(value).TrimEnd('=').Replace('+','-').Replace('/','_');}
  public static string RandomValue(){var bytes=new byte[48];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);return Base64Url(bytes);}
  public static string Challenge(string verifier){using(var sha=SHA256.Create())return Base64Url(sha.ComputeHash(Encoding.ASCII.GetBytes(verifier)));}
  public static string StableKey(string prefix,string input){using(var sha=SHA256.Create())return prefix+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(input))).Replace("-","").ToLowerInvariant();}
  public static bool ClientIdValid(string value){return value!=null&&value.Length<=250&&Regex.IsMatch(value,@"\A[A-Za-z0-9._-]+\.apps\.googleusercontent\.com\z");}
  public static string Scope(string service){if(service=="calendar")return "https://www.googleapis.com/auth/calendar.events.readonly";if(service=="gmail")return "https://www.googleapis.com/auth/gmail.metadata";throw new ArgumentException("Choose Calendar or Gmail.");}
  public static string CallbackCode(string target,string expectedState){
   if(target==null||target.Length>8192||!target.StartsWith("/",StringComparison.Ordinal)||target.StartsWith("//",StringComparison.Ordinal)||target.Any(char.IsControl))throw new NativeGoogleException(400,"Invalid sign-in response.");
   Uri callback;if(!Uri.TryCreate("http://127.0.0.1"+target,UriKind.Absolute,out callback)||callback.AbsolutePath!="/"||!string.IsNullOrEmpty(callback.Fragment))throw new NativeGoogleException(400,"Invalid sign-in response.");
   var values=HttpUtility.ParseQueryString(callback.Query);var states=values.GetValues("state");var codes=values.GetValues("code");
   if(states==null||states.Length!=1||states[0]!=expectedState)throw new NativeGoogleException(400,"Sign-in response did not match this connection attempt.");
   if(!string.IsNullOrEmpty(values["error"]))throw new NativeGoogleException(401,"Google sign-in was declined. You can connect again later.");
   if(codes==null||codes.Length!=1||string.IsNullOrEmpty(codes[0])||codes[0].Length>4096||codes[0].Any(char.IsControl))throw new NativeGoogleException(400,"Invalid sign-in response.");return codes[0];
  }
  public static NativeGoogleConfig Normalize(NativeGoogleConfig value){
   value=value??new NativeGoogleConfig();if(!string.IsNullOrEmpty(value.ClientId)&&!ClientIdValid(value.ClientId.Trim()))throw new ArgumentException("Enter a public Desktop OAuth client ID from your own Google project.");
   if((value.ClientSecret??"").Length>2048||(value.ClientSecret??"").Any(char.IsControl))throw new ArgumentException("The optional Desktop client secret is invalid.");
   var result=new NativeGoogleConfig{ClientId=(value.ClientId??"").Trim(),ClientSecret=value.ClientSecret??"",OffsetMinutes=new[]{0,5,10,15,30,60}.Contains(value.OffsetMinutes)?value.OffsetMinutes:10,CheckMinutes=new[]{1,5,15}.Contains(value.CheckMinutes)?value.CheckMinutes:1,GmailMode=new[]{"all","important","senders"}.Contains(value.GmailMode)?value.GmailMode:"all",GmailMuted=value.GmailMuted,AllDayReminders=value.AllDayReminders,AllDayHour=Math.Max(0,Math.Min(23,value.AllDayHour))};
   result.CalendarIds=(value.CalendarIds??new List<string>()).Where(x=>!string.IsNullOrWhiteSpace(x)&&x.Length<=250&&!x.Any(char.IsControl)).Select(x=>x.Trim()).Distinct().Take(20).ToList();if(result.CalendarIds.Count==0)result.CalendarIds.Add("primary");
   result.GmailSenders=(value.GmailSenders??new List<string>()).Where(x=>x!=null&&x.Length<=250).Select(x=>x.Trim().ToLowerInvariant()).Where(x=>Regex.IsMatch(x,@"\A[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}\z")).Distinct().Take(100).ToList();return result;
  }
 } public sealed class NativeGoogleEngine:IDisposable {
  readonly string filePath;readonly HttpClient http;readonly Func<DateTime> clock;readonly Action<string> openBrowser;readonly SemaphoreSlim gate=new SemaphoreSlim(1,1);
  readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=2*1024*1024,RecursionLimit=40};
  NativeGooglePrivateState state;static readonly byte[] Entropy=Encoding.UTF8.GetBytes("Mochi.Google.Private.1");
  public NativeGoogleEngine(string privateDirectory=null):this(privateDirectory,new HttpClientHandler{AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate},null,null){}
  internal NativeGoogleEngine(string privateDirectory,HttpMessageHandler handler,Func<DateTime> now,Action<string> browser){
   string folder=privateDirectory??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Mochi","Google");filePath=Path.Combine(Path.GetFullPath(folder),"google-private.dat");
   http=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(20),MaxResponseContentBufferSize=2*1024*1024};clock=now??(()=>DateTime.UtcNow);openBrowser=browser??(url=>Process.Start(new ProcessStartInfo(url){UseShellExecute=true}));state=Load();
  }
  NativeGooglePrivateState Load(){
   if(!File.Exists(filePath))return new NativeGooglePrivateState();
   try{
    if(new FileInfo(filePath).Length>3*1024*1024)throw new InvalidDataException();
    byte[] bytes=ProtectedData.Unprotect(File.ReadAllBytes(filePath),Entropy,DataProtectionScope.CurrentUser);NativeGooglePrivateState loaded;
    try{loaded=json.Deserialize<NativeGooglePrivateState>(Encoding.UTF8.GetString(bytes));}finally{Array.Clear(bytes,0,bytes.Length);}
    if(loaded==null||loaded.Version!=1||loaded.Calendar==null||loaded.Gmail==null||loaded.Seen==null||loaded.PendingIds==null||loaded.Outbox==null||loaded.CalendarEvents==null)throw new InvalidDataException();
    loaded.Config=NativeGoogleSecurity.Normalize(loaded.Config);return loaded;
   }catch{return new NativeGooglePrivateState{Calendar=new NativeGoogleGrant{Error="The protected Google cache could not be read. Connect again."},Gmail=new NativeGoogleGrant{Error="The protected Google cache could not be read. Connect again."}};}
  }
  void Save(){
   Directory.CreateDirectory(Path.GetDirectoryName(filePath));byte[] plain=Encoding.UTF8.GetBytes(json.Serialize(state));byte[] encrypted;
   try{encrypted=ProtectedData.Protect(plain,Entropy,DataProtectionScope.CurrentUser);}finally{Array.Clear(plain,0,plain.Length);}
   if(encrypted.Length>3*1024*1024)throw new NativeGoogleException(0,"The private Google cache reached its local size limit. Reconnect the affected service.");
   string temporary=filePath+".tmp";using(var file=new FileStream(temporary,FileMode.Create,FileAccess.Write,FileShare.None)){file.Write(encrypted,0,encrypted.Length);file.Flush(true);}
   if(File.Exists(filePath))File.Replace(temporary,filePath,null);else File.Move(temporary,filePath);
  }
  public NativeGoogleConfig Config{get{return NativeGoogleSecurity.Normalize(state.Config);}}
  public void SaveConfiguration(NativeGoogleConfig config){gate.Wait();try{var normalized=NativeGoogleSecurity.Normalize(config);if(normalized.ClientId!=state.Config.ClientId)state=new NativeGooglePrivateState();state.Config=normalized;state.Calendar.NextCheckUtcTicks=0;state.Gmail.NextCheckUtcTicks=0;Save();}finally{gate.Release();}}
  static bool Connected(NativeGoogleGrant value){return !string.IsNullOrEmpty(value.RefreshToken)||!string.IsNullOrEmpty(value.AccessToken);}
  static NativeGoogleServiceStatus Status(NativeGoogleGrant value){return new NativeGoogleServiceStatus{Connected=Connected(value),LastSyncUtcTicks=value.LastSyncUtcTicks,NextCheckUtcTicks=value.NextCheckUtcTicks,Error=value.Error??"",Summary=value.Summary??"",GrantId=value.GrantId??""};}
  public NativeGoogleStatus GetStatus(){return new NativeGoogleStatus{Calendar=Status(state.Calendar),Gmail=Status(state.Gmail),ScheduledEvents=state.CalendarEvents.Count,HorizonEndUtcTicks=state.HorizonEndUtcTicks,GmailMode=state.Config.GmailMode,PollMinutes=state.Config.CheckMinutes};}
  NativeGoogleGrant Grant(string service){NativeGoogleSecurity.Scope(service);return service=="calendar"?state.Calendar:state.Gmail;}
  static Dictionary<string,object> Obj(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
  static object Value(Dictionary<string,object> map,string key){object value;return map.TryGetValue(key,out value)?value:null;}
  static string Text(Dictionary<string,object> map,string key){var value=Value(map,key);return value==null?"":Convert.ToString(value,CultureInfo.InvariantCulture);}
  static IEnumerable<object> Items(Dictionary<string,object> map,string key){return Value(map,key) as object[]??new object[0];}
  static string Enc(string value){return Uri.EscapeDataString(value??"");}
  async Task<Dictionary<string,object>> Request(HttpRequestMessage request,bool tokenEndpoint){
   Uri url=request.RequestUri;
   if(url.Scheme!="https"||!string.IsNullOrEmpty(url.UserInfo)||!url.IsDefaultPort||!(url.Host=="oauth2.googleapis.com"&&url.AbsolutePath=="/token"||url.Host=="www.googleapis.com"&&url.AbsolutePath.StartsWith("/calendar/v3/calendars/",StringComparison.Ordinal)||url.Host=="gmail.googleapis.com"&&url.AbsolutePath.StartsWith("/gmail/v1/users/me/",StringComparison.Ordinal)))throw new NativeGoogleException(0,"Untrusted Google endpoint was refused.");
   try{using(request)using(var response=await http.SendAsync(request,HttpCompletionOption.ResponseContentRead).ConfigureAwait(false)){
    if(response.Content.Headers.ContentLength.GetValueOrDefault()>2*1024*1024)throw new NativeGoogleException(503,"Google returned too much data. Select fewer calendars.");
    await response.Content.LoadIntoBufferAsync(2*1024*1024).ConfigureAwait(false);var body=await response.Content.ReadAsStringAsync().ConfigureAwait(false);
    Dictionary<string,object> parsed;try{parsed=Obj(json.DeserializeObject(body));}catch{throw new NativeGoogleException(503,"Google returned an unreadable response. Try again later.");}
    if(!response.IsSuccessStatusCode){int status=(int)response.StatusCode;string code=Text(parsed,"error");var problem=Obj(Value(parsed,"error"));bool quota=status==429||Items(problem,"errors").Any(x=>Regex.IsMatch(Text(Obj(x),"reason"),"quota|rateLimit",RegexOptions.IgnoreCase));
     if(quota)throw new NativeGoogleException(429,"Google's quota is temporarily exhausted. Mochi will retry with backoff.");
     if(status==401||code=="invalid_grant")throw new NativeGoogleException(401,"Google authorization expired or was revoked. Connect this service again.");
     if(tokenEndpoint&&code=="invalid_client")throw new NativeGoogleException(400,"Google rejected this Desktop client. Check the client type and optional local client secret.");
     if(status==404)throw new NativeGoogleException(404,"Google no longer has this record.");
     if(status==403)throw new NativeGoogleException(403,"Google denied access. Check API enablement and read-only consent.");
     throw new NativeGoogleException(status,"Google could not complete the request. Mochi will retry later.");
    }return parsed;
   }}catch(NativeGoogleException){throw;}catch{throw new NativeGoogleException(503,"Google is unreachable or timed out. Mochi will retry later.");}
  }
  async Task<Dictionary<string,object>> Token(Dictionary<string,string> fields){return await Request(new HttpRequestMessage(HttpMethod.Post,"https://oauth2.googleapis.com/token"){Content=new FormUrlEncodedContent(fields)},true).ConfigureAwait(false);}
  async Task<string> Access(string service){
   var grant=Grant(service);if(!string.IsNullOrEmpty(grant.AccessToken)&&grant.ExpiresUtcTicks>clock().AddSeconds(60).Ticks)return grant.AccessToken;
   if(string.IsNullOrEmpty(grant.RefreshToken))throw new NativeGoogleException(401,"Connect this Google service again to continue monitoring.");
   var form=new Dictionary<string,string>{{"client_id",state.Config.ClientId},{"grant_type","refresh_token"},{"refresh_token",grant.RefreshToken}};
   if(!string.IsNullOrEmpty(state.Config.ClientSecret))form["client_secret"]=state.Config.ClientSecret;
   var result=await Token(form).ConfigureAwait(false);string token=Text(result,"access_token");if(string.IsNullOrEmpty(token))throw new NativeGoogleException(401,"Google did not return an access token. Connect again.");
   long seconds;long.TryParse(Text(result,"expires_in"),out seconds);grant.AccessToken=token;grant.ExpiresUtcTicks=clock().AddSeconds(Math.Max(60,Math.Min(86400,seconds))).Ticks;
   if(!string.IsNullOrEmpty(Text(result,"refresh_token")))grant.RefreshToken=Text(result,"refresh_token");Save();return token;
  }
  async Task<Dictionary<string,object>> Get(string service,string url){
   for(int attempt=0;attempt<2;attempt++){var request=new HttpRequestMessage(HttpMethod.Get,url);request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await Access(service).ConfigureAwait(false));
    try{return await Request(request,false).ConfigureAwait(false);}catch(NativeGoogleException error){if(error.Status!=401||attempt!=0)throw;Grant(service).AccessToken="";Grant(service).ExpiresUtcTicks=0;}}
   throw new NativeGoogleException(401,"Connect this Google service again.");
  }  public async Task ConnectAsync(string service){
   NativeGoogleSecurity.Scope(service);await gate.WaitAsync().ConfigureAwait(false);
   try{
    if(!NativeGoogleSecurity.ClientIdValid(state.Config.ClientId))throw new NativeGoogleException(0,"Save your own Google Desktop OAuth client ID first. A Chrome Extension client is not interchangeable.");
    string verifier=NativeGoogleSecurity.RandomValue(),nonce=NativeGoogleSecurity.RandomValue();var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
    string redirect="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port.ToString(CultureInfo.InvariantCulture)+"/";string code=null;
    try{
     string authorize="https://accounts.google.com/o/oauth2/v2/auth?client_id="+Enc(state.Config.ClientId)+"&redirect_uri="+Enc(redirect)+"&response_type=code&scope="+Enc(NativeGoogleSecurity.Scope(service))+"&code_challenge="+Enc(NativeGoogleSecurity.Challenge(verifier))+"&code_challenge_method=S256&state="+Enc(nonce)+"&access_type=offline&prompt=consent";
     openBrowser(authorize);var deadline=DateTime.UtcNow.AddMinutes(5);
     for(int attempts=0;attempts<16&&DateTime.UtcNow<deadline&&code==null;attempts++){
      var accept=listener.AcceptTcpClientAsync();var remaining=deadline-DateTime.UtcNow;
      if(await Task.WhenAny(accept,Task.Delay(remaining>TimeSpan.Zero?remaining:TimeSpan.FromMilliseconds(1))).ConfigureAwait(false)!=accept)throw new NativeGoogleException(0,"Google sign-in timed out. You can connect again.");
      using(var client=await accept.ConfigureAwait(false))using(var stream=client.GetStream()){
       if(!IPAddress.IsLoopback(((IPEndPoint)client.Client.RemoteEndPoint).Address))continue;
       var bytes=new byte[8192];int count=0;bool complete=false;
       while(count<bytes.Length){var read=stream.ReadAsync(bytes,count,bytes.Length-count);if(await Task.WhenAny(read,Task.Delay(5000)).ConfigureAwait(false)!=read)break;int got=await read.ConfigureAwait(false);if(got==0)break;count+=got;if(Encoding.ASCII.GetString(bytes,0,count).Contains("\r\n\r\n")){complete=true;break;}}
       string request=Encoding.ASCII.GetString(bytes,0,count);var lines=request.Split(new[]{"\r\n"},StringSplitOptions.None);var first=lines[0].Split(' ');bool valid=complete&&first.Length==3&&first[0]=="GET"&&first[2].StartsWith("HTTP/1.",StringComparison.Ordinal)&&lines.Any(x=>string.Equals(x,"Host: 127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port.ToString(CultureInfo.InvariantCulture),StringComparison.OrdinalIgnoreCase));
       string response="Invalid sign-in response. Return to Mochi and try again.";bool success=false;NativeGoogleException denied=null;
       if(valid)try{code=NativeGoogleSecurity.CallbackCode(first[1],nonce);success=true;response="Mochi received your sign-in response. You can close this tab and return to Mochi.";}catch(NativeGoogleException error){if(error.Status==401)denied=error;}
       string html="<!doctype html><html><head><meta charset='utf-8'><title>Mochi sign-in</title></head><body><h1>Mochi</h1><p>"+response+"</p></body></html>";byte[] body=Encoding.UTF8.GetBytes(html);byte[] header=Encoding.ASCII.GetBytes("HTTP/1.1 "+(success?"200 OK":"400 Bad Request")+"\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: "+body.Length+"\r\n\r\n");
       await stream.WriteAsync(header,0,header.Length).ConfigureAwait(false);await stream.WriteAsync(body,0,body.Length).ConfigureAwait(false);if(denied!=null)throw denied;
      }
     }
     if(code==null)throw new NativeGoogleException(0,"Google sign-in did not return a valid response. Try connecting again.");
    }finally{listener.Stop();}
    var form=new Dictionary<string,string>{{"client_id",state.Config.ClientId},{"code",code},{"redirect_uri",redirect},{"code_verifier",verifier},{"grant_type","authorization_code"}};
    if(!string.IsNullOrEmpty(state.Config.ClientSecret))form["client_secret"]=state.Config.ClientSecret;
    ApplyGrant(service,await Token(form).ConfigureAwait(false));
   }catch(NativeGoogleException){throw;}catch{throw new NativeGoogleException(0,"Mochi could not complete Google sign-in. Check the Desktop client setup and try again.");}finally{gate.Release();}
  }

  internal void ApplyGrant(string service,Dictionary<string,object> result){
   string access=Text(result,"access_token");var granted=Text(result,"scope").Split(' ');
   if(string.IsNullOrEmpty(access)||!granted.Contains(NativeGoogleSecurity.Scope(service)))throw new NativeGoogleException(401,"The requested read-only Google permission was not granted.");
   var grant=Grant(service);grant.GrantId=Guid.NewGuid().ToString("N");grant.AccessToken=access;grant.RefreshToken=Text(result,"refresh_token");long seconds;long.TryParse(Text(result,"expires_in"),out seconds);grant.ExpiresUtcTicks=clock().AddSeconds(Math.Max(60,Math.Min(86400,seconds))).Ticks;grant.NextCheckUtcTicks=0;grant.Error="";grant.Failures=0;grant.LastSyncUtcTicks=0;grant.Summary="Connected. Refresh now to prepare monitoring.";
   if(service=="gmail"){state.HistoryId=null;state.PendingIds.Clear();state.PendingCursor=null;state.Seen.Clear();state.Outbox.Clear();state.GmailBaselineUtcTicks=0;}
   else{state.CalendarEvents.Clear();state.CalendarSnapshotAvailable=false;state.HorizonEndUtcTicks=0;}
   Save();
  }
  public async Task DisconnectAsync(string service){
   NativeGoogleSecurity.Scope(service);await gate.WaitAsync().ConfigureAwait(false);try{
    if(service=="calendar"){state.Calendar=new NativeGoogleGrant();state.CalendarEvents.Clear();state.CalendarSnapshotAvailable=false;state.HorizonEndUtcTicks=0;}
    else{state.Gmail=new NativeGoogleGrant();state.HistoryId=null;state.PendingCursor=null;state.PendingIds.Clear();state.Seen.Clear();state.Outbox.Clear();}
    // Local disconnection is deliberately service-specific. Google-side revocation is a separate account action.
    Save();
   }finally{gate.Release();}
  }
  public void AcknowledgeMail(IEnumerable<string> keys){gate.Wait();try{var accepted=new HashSet<string>(keys??new string[0]);state.Outbox=state.Outbox.Where(x=>!accepted.Contains(x.Key)).ToList();Save();}finally{gate.Release();}}
  async Task<List<Dictionary<string,object>>> Pages(string service,string url,string itemKey,int maximumPages){
   var result=new List<Dictionary<string,object>>();string next=null;var pages=new HashSet<string>();
   for(int page=0;page<maximumPages;page++){
    var response=await Get(service,url+(string.IsNullOrEmpty(next)?"":"&pageToken="+Enc(next))).ConfigureAwait(false);result.AddRange(Items(response,itemKey).Select(Obj));
    next=Text(response,"nextPageToken");if(string.IsNullOrEmpty(next))return result;if(!pages.Add(next))throw new NativeGoogleException(503,"Google repeated a page. The previous schedule was retained.");
   }throw new NativeGoogleException(503,"This selection exceeds Mochi's bounded sync budget. Select fewer calendars or retry after reducing the inbox.");
  }
  internal static long CalendarTime(Dictionary<string,object> value){
   string dateTime=Text(value,"dateTime");DateTimeOffset instant;if(!string.IsNullOrEmpty(dateTime)&&DateTimeOffset.TryParse(dateTime,CultureInfo.InvariantCulture,DateTimeStyles.AllowWhiteSpaces,out instant))return instant.UtcTicks;
   DateTime date;if(DateTime.TryParseExact(Text(value,"date"),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out date))return ReminderEngine.LocalToUtc(date,TimeZoneInfo.Local).Ticks;
   return 0;
  }
  async Task SyncCalendar(){
   DateTime now=clock(),end=now.AddDays(30);var collected=new List<NativeCalendarEvent>();
   foreach(string calendarId in state.Config.CalendarIds){
    string url="https://www.googleapis.com/calendar/v3/calendars/"+Enc(calendarId)+"/events?timeMin="+Enc(now.ToString("o",CultureInfo.InvariantCulture))+"&timeMax="+Enc(end.ToString("o",CultureInfo.InvariantCulture))+"&singleEvents=true&orderBy=startTime&maxResults=250&fields="+Enc("items(id,status,start,end),nextPageToken");
    var events=await Pages("calendar",url,"items",5).ConfigureAwait(false);
    foreach(var item in events){if(Text(item,"status")=="cancelled"||string.IsNullOrEmpty(Text(item,"id")))continue;var start=Obj(Value(item,"start"));long begin=CalendarTime(start),finish=CalendarTime(Obj(Value(item,"end")));if(begin==0||finish<=begin)continue;
     collected.Add(new NativeCalendarEvent{Key=NativeGoogleSecurity.StableKey("gcal-",calendarId+":"+Text(item,"id")+":"+begin.ToString(CultureInfo.InvariantCulture)),StartUtcTicks=begin,EndUtcTicks=finish,AllDay=string.IsNullOrEmpty(Text(start,"dateTime"))});
     if(collected.Count>900)throw new NativeGoogleException(0,"The selected calendars exceed the 900-event desktop budget. The previous schedule was retained.");
    }
   }
   state.CalendarEvents=collected.OrderBy(x=>x.StartUtcTicks).ToList();state.HorizonEndUtcTicks=end.Ticks;state.CalendarSnapshotAvailable=true;state.Calendar.Summary=collected.Count.ToString(CultureInfo.InvariantCulture)+" events saved in the next 30 days. Refreshes keep this rolling window current.";Save();
  }
  const string GmailRoot="https://gmail.googleapis.com/gmail/v1/users/me/";
  async Task<int> UnreadCount(){var result=await Get("gmail",GmailRoot+"labels/INBOX?fields=messagesUnread").ConfigureAwait(false);int count;return int.TryParse(Text(result,"messagesUnread"),out count)?Math.Max(0,count):0;}
  async Task SyncGmail(){
   DateTime now=clock();int unread;
   if(string.IsNullOrEmpty(state.HistoryId)){
    // A cursor baseline avoids downloading old inbox mail and preserves arrivals during setup.
    var profile=await Get("gmail",GmailRoot+"profile?fields=historyId").ConfigureAwait(false);string cursor=Text(profile,"historyId");
    if(string.IsNullOrEmpty(cursor)||cursor.Length>256)throw new NativeGoogleException(503,"Google did not return a mail history cursor.");
    unread=await UnreadCount().ConfigureAwait(false);state.HistoryId=cursor;state.GmailBaselineUtcTicks=now.Ticks;
    state.Gmail.Summary="Monitoring is ready. New inbox mail is checked every "+state.Config.CheckMinutes+" minute(s). "+unread+" unread in Gmail.";Save();return;
   }
   if(state.PendingIds.Count==0){
    string next=null,cursor=state.HistoryId;var ids=new HashSet<string>();var visited=new HashSet<string>();bool finished=false;
    for(int page=0;page<10;page++){
     string url=GmailRoot+"history?startHistoryId="+Enc(state.HistoryId)+"&historyTypes=messageAdded&historyTypes=labelAdded&maxResults=100&fields="+Enc("history(messagesAdded(message(id)),labelsAdded(message(id),labelIds)),historyId,nextPageToken")+(string.IsNullOrEmpty(next)?"":"&pageToken="+Enc(next));
     Dictionary<string,object> result;
     try{result=await Get("gmail",url).ConfigureAwait(false);}catch(NativeGoogleException error){if(error.Status==404)throw new NativeGoogleException(410,"Gmail's history expired. Open Gmail to check mail received while offline, then reconnect Gmail to start a new baseline.");throw;}
     foreach(var history in Items(result,"history").Select(Obj)){
      foreach(var entry in Items(history,"messagesAdded").Select(Obj)){string id=Text(Obj(Value(entry,"message")),"id");if(!string.IsNullOrEmpty(id)&&id.Length<=256)ids.Add(id);}
      foreach(var entry in Items(history,"labelsAdded").Select(Obj))if(Items(entry,"labelIds").Any(x=>Convert.ToString(x,CultureInfo.InvariantCulture)=="INBOX")){string id=Text(Obj(Value(entry,"message")),"id");if(!string.IsNullOrEmpty(id)&&id.Length<=256)ids.Add(id);}
     }
     if(ids.Count>5000)throw new NativeGoogleException(503,"This mail batch exceeds the local budget. Open Gmail, then try refreshing later.");
     if(!string.IsNullOrEmpty(Text(result,"historyId")))cursor=Text(result,"historyId");next=Text(result,"nextPageToken");
     if(string.IsNullOrEmpty(next)){finished=true;break;}if(!visited.Add(next))throw new NativeGoogleException(503,"Google repeated a mail history page. The cursor was retained.");
    }
    if(!finished)throw new NativeGoogleException(503,"Mail history exceeds this check's page budget. The previous cursor was retained.");
    state.PendingIds=ids.ToList();state.PendingCursor=cursor;Save();
   }
   int filtered=0,alreadyRead=0,eligible=0;var watch=Stopwatch.StartNew();var seen=new HashSet<string>(state.Seen);
   foreach(string id in state.PendingIds.Take(50).ToList()){
    if(watch.Elapsed>TimeSpan.FromSeconds(20))break;
    if(!seen.Contains(id)){
     bool needSender=state.Config.GmailMode!="all"&&state.Config.GmailSenders.Count>0;
     string url=GmailRoot+"messages/"+Enc(id)+"?format=metadata&fields="+Enc(needSender?"id,labelIds,internalDate,payload(headers)":"id,labelIds,internalDate")+(needSender?"&metadataHeaders=From":"");
     Dictionary<string,object> message=null;try{message=await Get("gmail",url).ConfigureAwait(false);}catch(NativeGoogleException error){if(error.Status!=404)throw;}
     var labels=message==null?new HashSet<string>():new HashSet<string>(Items(message,"labelIds").Select(x=>Convert.ToString(x,CultureInfo.InvariantCulture)));
     // A Sent candidate is reconsidered when Gmail subsequently adds the Inbox label.
     if(labels.Contains("INBOX")){
      long millis;long received=0;if(long.TryParse(Text(message,"internalDate"),out millis)&&millis>=0&&millis<253402300799000L)received=new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc).AddMilliseconds(millis).Ticks;
      if(!labels.Contains("UNREAD"))alreadyRead++;
      if(received>=state.GmailBaselineUtcTicks){
       string address="";if(needSender){var from=Items(Obj(Value(message,"payload")),"headers").Select(Obj).FirstOrDefault(x=>string.Equals(Text(x,"name"),"From",StringComparison.OrdinalIgnoreCase));string header=from==null?"":Text(from,"value");var match=Regex.Match(header,@"<([^<>]+)>");address=(match.Success?match.Groups[1].Value:header).Trim().ToLowerInvariant();}
       bool important=labels.Contains("IMPORTANT")||state.Config.GmailSenders.Contains(address);bool allowed=state.Config.GmailMode=="all"||state.Config.GmailMode=="important"&&important||state.Config.GmailMode=="senders"&&state.Config.GmailSenders.Contains(address);
       if(allowed){string key=NativeGoogleSecurity.StableKey("gmail-",id);if(!state.Outbox.Any(x=>x.Key==key)){
         if(state.Outbox.Count>=1000)throw new NativeGoogleException(0,"The local mail alert queue is full. Acknowledge old alerts before refreshing.");
         state.Outbox.Add(new NativeMailAlert{Key=key,ReceivedUtcTicks=received,Important=important});eligible++;
        }}else filtered++;seen.Add(id);
      }else seen.Add(id);
     }
    }
    state.PendingIds.Remove(id);state.Seen=seen.Skip(Math.Max(0,seen.Count-5000)).ToList();Save();
   }
   if(state.PendingIds.Count==0){state.HistoryId=state.PendingCursor??state.HistoryId;state.PendingCursor=null;}
   unread=await UnreadCount().ConfigureAwait(false);
   state.Gmail.Summary=(state.Config.GmailMuted?"Mail alerts are muted and queued. ":"")+eligible+" new alert(s); "+state.Outbox.Count+" waiting for desktop acknowledgement; "+filtered+" filtered; "+alreadyRead+" already read. "+unread+" unread in Gmail."+(state.PendingIds.Count>0?" More messages will be checked next time.":"");Save();
  }

  public NativeGoogleBatch CachedBatch(){return Batch();}
  NativeGoogleBatch Batch(){return new NativeGoogleBatch{CalendarGrantId=state.Calendar.GrantId??"",GmailGrantId=state.Gmail.GrantId??"",CalendarSnapshotAvailable=state.CalendarSnapshotAvailable,CalendarEvents=state.CalendarEvents.Select(x=>new NativeCalendarEvent{Key=x.Key,StartUtcTicks=x.StartUtcTicks,EndUtcTicks=x.EndUtcTicks,AllDay=x.AllDay}).ToList(),HorizonEndUtcTicks=state.HorizonEndUtcTicks,MailAlerts=state.Config.GmailMuted?new List<NativeMailAlert>():state.Outbox.Select(x=>new NativeMailAlert{Key=x.Key,ReceivedUtcTicks=x.ReceivedUtcTicks,Important=x.Important}).ToList()};}
  public async Task<NativeGoogleBatch> SyncAsync(bool force=false){
   await gate.WaitAsync().ConfigureAwait(false);try{
    foreach(string service in new[]{"calendar","gmail"}){
     var grant=Grant(service);if(!Connected(grant)||!force&&grant.NextCheckUtcTicks>clock().Ticks)continue;
     try{
      if(service=="calendar")await SyncCalendar().ConfigureAwait(false);else await SyncGmail().ConfigureAwait(false);
      grant.LastSyncUtcTicks=clock().Ticks;grant.NextCheckUtcTicks=clock().AddMinutes(state.Config.CheckMinutes).Ticks;grant.Error="";grant.Failures=0;
     }catch(Exception failure){var problem=failure as NativeGoogleException??new NativeGoogleException(503,"Google synchronization failed. Mochi will retry later.");grant.Error=problem.Message;grant.Failures=Math.Min(20,grant.Failures+1);grant.NextCheckUtcTicks=clock().AddMinutes(Math.Min(360,state.Config.CheckMinutes*Math.Pow(2,Math.Min(grant.Failures,8)))).Ticks;
      if(problem.Status==401||problem.Status==410){grant.AccessToken="";grant.RefreshToken="";grant.ExpiresUtcTicks=0;grant.NextCheckUtcTicks=0;}
     }
     Save();
    }return Batch();
   }finally{gate.Release();}
  }
  public void Dispose(){http.Dispose();gate.Dispose();}
 }
}

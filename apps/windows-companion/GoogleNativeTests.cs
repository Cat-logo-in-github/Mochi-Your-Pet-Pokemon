
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
namespace MochiDesktop {
 public static class GoogleNativeTests {
  sealed class FakeHandler:HttpMessageHandler {
   public Func<HttpRequestMessage,HttpResponseMessage> Reply;
   public readonly List<string> Urls=new List<string>();
   protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){Urls.Add(request.RequestUri.AbsoluteUri);return Task.FromResult(Reply(request));}
  }
  static HttpResponseMessage Json(string text,HttpStatusCode status=HttpStatusCode.OK){return new HttpResponseMessage(status){Content=new StringContent(text,Encoding.UTF8,"application/json")};}
  static void Assert(bool value,string message){if(!value)throw new Exception(message);}
  static NativeGooglePrivateState Private(NativeGoogleEngine engine){return (NativeGooglePrivateState)typeof(NativeGoogleEngine).GetField("state",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(engine);}
  static void Seed(NativeGoogleEngine engine,string service,DateTime now){var state=Private(engine);state.Config.ClientId="fixture.apps.googleusercontent.com";var grant=service=="gmail"?state.Gmail:state.Calendar;grant.AccessToken="fixture-access-only";grant.RefreshToken="fixture-refresh-only";grant.ExpiresUtcTicks=now.AddHours(1).Ticks;grant.GrantId=service+"-fixture";}
  static long Millis(DateTime value){return (long)(value-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;}
  static string DirectoryFor(string root,string leaf){string folder=Path.Combine(root,"google-engine",leaf);Directory.CreateDirectory(folder);foreach(string file in Directory.GetFiles(folder,"google-private.dat*"))File.Delete(file);return folder;}
  public static void Add(Action<string,Action> test,string root){
   test("Desktop Google defaults use own project, all new mail and bounded one-minute checks",delegate{
    var c=NativeGoogleSecurity.Normalize(null);Assert(c.ClientId==""&&c.GmailMode=="all"&&c.CheckMinutes==1&&c.AllDayReminders&&c.AllDayHour==9,"Unsafe or surprising defaults");
    c=NativeGoogleSecurity.Normalize(new NativeGoogleConfig{CheckMinutes=0,OffsetMinutes=999,AllDayHour=99,GmailSenders=new List<string>{" Reader@Example.invalid ","invalid","reader@example.invalid"}});
    Assert(c.CheckMinutes==1&&c.OffsetMinutes==10&&c.AllDayHour==23&&c.GmailSenders.SequenceEqual(new[]{"reader@example.invalid"}),"Configuration normalization failed");
   });
   test("Desktop PKCE uses S256 and cryptographic fresh state",delegate{
    Assert(NativeGoogleSecurity.Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")=="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM","RFC7636 challenge mismatch");
    var a=NativeGoogleSecurity.RandomValue();Assert(a.Length>=43&&a.Length<=128&&a!=NativeGoogleSecurity.RandomValue()&&!a.Contains("="),"Verifier/state not fresh or URL safe");
   });
   test("Desktop callback rejects wrong state, duplicate parameters and untrusted paths",delegate{
    Assert(NativeGoogleSecurity.CallbackCode("/?state=nonce&code=fixture","nonce")=="fixture","Valid callback rejected");
    foreach(string value in new[]{"/?state=other&code=fixture","/?state=nonce&state=nonce&code=fixture","/?state=nonce&code=a&code=b","//evil.invalid/?state=nonce&code=a","/other?state=nonce&code=a","/?state=nonce&code=%0A","/?state=nonce&error=access_denied"}){
     bool failed=false;try{NativeGoogleSecurity.CallbackCode(value,"nonce");}catch(NativeGoogleException){failed=true;}Assert(failed,"Untrusted callback accepted");
    }
   });
   test("Desktop Google private configuration is encrypted for the Windows user",delegate{
    string folder=DirectoryFor(root,"encrypted");
    using(var e=new NativeGoogleEngine(folder,new FakeHandler{Reply=r=>Json("{}")},null,u=>{})){e.SaveConfiguration(new NativeGoogleConfig{ClientId="fixture.apps.googleusercontent.com",ClientSecret="fixture-local-secret"});}
    var raw=Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(folder,"google-private.dat")));Assert(!raw.Contains("fixture-local-secret")&&!raw.Contains("fixture.apps"),"Private config stored in plaintext");
    using(var e=new NativeGoogleEngine(folder,new FakeHandler{Reply=r=>Json("{}")},null,u=>{}))Assert(e.Config.ClientId=="fixture.apps.googleusercontent.com"&&e.Config.ClientSecret=="fixture-local-secret","Protected configuration did not reload");
   });
   test("Desktop Gmail baseline uses a history cursor without scanning old inbox mail",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);var h=new FakeHandler{Reply=r=>Json(r.RequestUri.AbsolutePath.EndsWith("/profile")?"{\"historyId\":\"10\"}":"{\"messagesUnread\":10000}")};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"baseline"),h,()=>now,u=>{})){Seed(e,"gmail",now);Assert(e.SyncAsync(true).GetAwaiter().GetResult().MailAlerts.Count==0,"Old inbox mail notified");Assert(h.Urls.Count==2&&!h.Urls.Any(x=>x.Contains("/messages?")),"Baseline scanned inbox");Assert(e.GetStatus().Gmail.LastSyncUtcTicks==now.Ticks&&e.GetStatus().Gmail.Summary.Contains("ready"),"Monitoring readiness missing");}
   });
   test("Desktop ordinary and self-read new inbox mail queues durably before acknowledgement",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);string folder=DirectoryFor(root,"durable");var h=new FakeHandler();
    h.Reply=r=>{string p=r.RequestUri.AbsolutePath;if(p.EndsWith("/profile"))return Json("{\"historyId\":\"10\"}");if(p.EndsWith("/history"))return Json("{\"history\":[{\"messagesAdded\":[{\"message\":{\"id\":\"one\"}}]}],\"historyId\":\"11\"}");if(p.Contains("/messages/")){Assert(!Uri.UnescapeDataString(r.RequestUri.Query).Contains("payload"),"All mode fetched headers");return Json("{\"id\":\"one\",\"labelIds\":[\"INBOX\"],\"internalDate\":\""+Millis(now)+"\"}");}return Json("{\"messagesUnread\":0}");};
    string key;
    using(var e=new NativeGoogleEngine(folder,h,()=>now,u=>{})){Seed(e,"gmail",now);e.SyncAsync(true).GetAwaiter().GetResult();now=now.AddSeconds(10);var b=e.SyncAsync(true).GetAwaiter().GetResult();Assert(b.MailAlerts.Count==1,"Ordinary/read-before-poll test mail was lost");key=b.MailAlerts[0].Key;Assert(!key.Contains("one"),"Raw message ID exposed");}
    using(var e=new NativeGoogleEngine(folder,h,()=>now,u=>{})){Assert(e.CachedBatch().MailAlerts.Count==1,"Mail alert lost on restart");e.SyncAsync(true).GetAwaiter().GetResult();Assert(e.CachedBatch().MailAlerts.Count==1,"Duplicate delivery queued");e.AcknowledgeMail(new[]{key});}
    using(var e=new NativeGoogleEngine(folder,h,()=>now,u=>{})){Assert(e.CachedBatch().MailAlerts.Count==0,"Acknowledged mail returned after restart");e.SyncAsync(true).GetAwaiter().GetResult();Assert(e.CachedBatch().MailAlerts.Count==0,"Acknowledged message history replayed");}
   });
   test("Desktop Gmail waits for Inbox label addition after an earlier Sent-only candidate",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);int round=0;var h=new FakeHandler{Reply=r=>{string p=r.RequestUri.AbsolutePath;if(p.EndsWith("/profile"))return Json("{\"historyId\":\"10\"}");if(p.EndsWith("/history"))return Json(round==0?"{\"history\":[{\"messagesAdded\":[{\"message\":{\"id\":\"self\"}}]}],\"historyId\":\"11\"}":"{\"history\":[{\"labelsAdded\":[{\"message\":{\"id\":\"self\"},\"labelIds\":[\"INBOX\"]}]}],\"historyId\":\"12\"}");if(p.Contains("/messages/"))return Json("{\"labelIds\":[\"SENT\""+(round==0?"":",\"INBOX\"")+"],\"internalDate\":\""+Millis(now)+"\"}");return Json("{\"messagesUnread\":0}");}};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"label-added"),h,()=>now,u=>{})){Seed(e,"gmail",now);e.SyncAsync(true).GetAwaiter().GetResult();now=now.AddSeconds(10);Assert(e.SyncAsync(true).GetAwaiter().GetResult().MailAlerts.Count==0,"Sent-only candidate alerted");round=1;Assert(e.SyncAsync(true).GetAwaiter().GetResult().MailAlerts.Count==1,"Later Inbox arrival was permanently suppressed");}
   });

   test("Desktop Gmail muted alerts remain queued for later unmute",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);var h=new FakeHandler{Reply=r=>{string p=r.RequestUri.AbsolutePath;if(p.EndsWith("/profile"))return Json("{\"historyId\":\"10\"}");if(p.EndsWith("/history"))return Json("{\"history\":[{\"messagesAdded\":[{\"message\":{\"id\":\"muted\"}}]}],\"historyId\":\"11\"}");if(p.Contains("/messages/"))return Json("{\"labelIds\":[\"INBOX\"],\"internalDate\":\""+Millis(now)+"\"}");return Json("{\"messagesUnread\":1}");}};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"muted"),h,()=>now,u=>{})){Seed(e,"gmail",now);e.SyncAsync(true).GetAwaiter().GetResult();var c=e.Config;c.GmailMuted=true;e.SaveConfiguration(c);now=now.AddSeconds(10);Assert(e.SyncAsync(true).GetAwaiter().GetResult().MailAlerts.Count==0,"Muted alert displayed");Assert(Private(e).Outbox.Count==1,"Muted mail silently discarded");c=e.Config;c.GmailMuted=false;e.SaveConfiguration(c);Assert(e.CachedBatch().MailAlerts.Count==1,"Unmuted alert was lost");}
   });
   test("Desktop important sender mode fetches only From metadata and matches exact addresses",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);var h=new FakeHandler{Reply=r=>{string p=r.RequestUri.AbsolutePath;if(p.EndsWith("/profile"))return Json("{\"historyId\":\"10\"}");if(p.EndsWith("/history"))return Json("{\"history\":[{\"messagesAdded\":[{\"message\":{\"id\":\"sender\"}}]}],\"historyId\":\"11\"}");if(p.Contains("/messages/")){Assert(r.RequestUri.Query.Contains("metadataHeaders=From")&&!r.RequestUri.Query.ToLowerInvariant().Contains("subject"),"Unexpected metadata request");return Json("{\"labelIds\":[\"INBOX\"],\"internalDate\":\""+Millis(now)+"\",\"payload\":{\"headers\":[{\"name\":\"From\",\"value\":\"Reader <reader@example.invalid>\"}]}}");}return Json("{\"messagesUnread\":1}");}};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"senders"),h,()=>now,u=>{})){Seed(e,"gmail",now);var c=e.Config;c.GmailMode="senders";c.GmailSenders.Add("reader@example.invalid");e.SaveConfiguration(c);e.SyncAsync(true).GetAwaiter().GetResult();now=now.AddSeconds(10);var b=e.SyncAsync(true).GetAwaiter().GetResult();Assert(b.MailAlerts.Count==1&&b.MailAlerts[0].Important,"Exact important sender not queued");}
   });
   test("Desktop Calendar keeps a complete thirty-day cache when a later refresh fails",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);bool fail=false;var h=new FakeHandler{Reply=r=>{Assert(!Uri.UnescapeDataString(r.RequestUri.Query).Contains("summary"),"Private event title requested");return fail?Json("{\"error\":{\"message\":\"private provider text\"}}",HttpStatusCode.ServiceUnavailable):Json("{\"items\":[{\"id\":\"timed\",\"start\":{\"dateTime\":\"2030-01-16T10:00:00+04:00\"},\"end\":{\"dateTime\":\"2030-01-16T11:00:00+04:00\"}},{\"id\":\"day\",\"start\":{\"date\":\"2030-01-17\"},\"end\":{\"date\":\"2030-01-18\"}},{\"id\":\"gone\",\"status\":\"cancelled\"}]}");}};
    string folder=DirectoryFor(root,"calendar");long horizon;
    using(var e=new NativeGoogleEngine(folder,h,()=>now,u=>{})){Seed(e,"calendar",now);var b=e.SyncAsync(true).GetAwaiter().GetResult();Assert(b.CalendarSnapshotAvailable&&b.CalendarEvents.Count==2&&b.CalendarEvents.Any(x=>x.AllDay),"Complete calendar snapshot missing");horizon=b.HorizonEndUtcTicks;Assert(horizon==now.AddDays(30).Ticks,"Calendar horizon not thirty days");fail=true;var cached=e.SyncAsync(true).GetAwaiter().GetResult();Assert(cached.CalendarSnapshotAvailable&&cached.CalendarEvents.Count==2,"Failed refresh erased cached alarms");Assert(!e.GetStatus().Calendar.Error.Contains("private provider"),"Provider body leaked");}
    using(var e=new NativeGoogleEngine(folder,h,()=>now,u=>{}))Assert(e.CachedBatch().CalendarEvents.Count==2&&e.CachedBatch().HorizonEndUtcTicks==horizon,"Offline calendar cache did not recover");
   });
   test("Desktop Calendar offsets are parsed as instants and opaque event keys are stable",delegate{
    var a=new Dictionary<string,object>{{"dateTime","2030-01-15T12:00:00+04:00"}};Assert(NativeGoogleEngine.CalendarTime(a)==new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc).Ticks,"Calendar offset ignored");
    Assert(NativeGoogleSecurity.StableKey("gcal-","fixture")==NativeGoogleSecurity.StableKey("gcal-","fixture")&&NativeGoogleSecurity.StableKey("gcal-","fixture")!=NativeGoogleSecurity.StableKey("gcal-","moved"),"Event occurrence identity unstable");
   });
   test("Desktop Google honors next-check timing and bounded quota backoff",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);bool quota=false;var h=new FakeHandler{Reply=r=>quota?Json("{\"error\":{\"errors\":[{\"reason\":\"rateLimitExceeded\"}]}}",HttpStatusCode.Forbidden):Json(r.RequestUri.AbsolutePath.EndsWith("/profile")?"{\"historyId\":\"10\"}":"{\"messagesUnread\":0}")};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"cadence"),h,()=>now,u=>{})){Seed(e,"gmail",now);e.SyncAsync(true).GetAwaiter().GetResult();int calls=h.Urls.Count;e.SyncAsync(false).GetAwaiter().GetResult();Assert(h.Urls.Count==calls,"Polled before the next scheduled check");now=now.AddSeconds(61);quota=true;e.SyncAsync(false).GetAwaiter().GetResult();Assert(e.GetStatus().Gmail.NextCheckUtcTicks>now.AddMinutes(1).Ticks&&e.GetStatus().Gmail.Error.Contains("quota"),"Quota failure did not back off");calls=h.Urls.Count;e.SyncAsync(false).GetAwaiter().GetResult();Assert(h.Urls.Count==calls,"Backoff was ignored");}
   });
   test("Desktop expired Gmail history requests reconnect instead of silently claiming complete delivery",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);var h=new FakeHandler{Reply=r=>r.RequestUri.AbsolutePath.EndsWith("/history")?Json("{}",HttpStatusCode.NotFound):Json(r.RequestUri.AbsolutePath.EndsWith("/profile")?"{\"historyId\":\"10\"}":"{\"messagesUnread\":0}")};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"expired-history"),h,()=>now,u=>{})){Seed(e,"gmail",now);e.SyncAsync(true).GetAwaiter().GetResult();e.SyncAsync(true).GetAwaiter().GetResult();Assert(!e.GetStatus().Gmail.Connected&&e.GetStatus().Gmail.Error.Contains("history expired"),"History gap hidden behind Connected status");}
   });
   test("Desktop token refresh uses a fixed HTTPS endpoint and keeps tokens out of URL query strings",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);bool refreshed=false;var h=new FakeHandler{Reply=r=>{if(r.RequestUri.Host=="oauth2.googleapis.com"){var body=r.Content.ReadAsStringAsync().GetAwaiter().GetResult();Assert(r.Method==HttpMethod.Post&&body.Contains("grant_type=refresh_token")&&!body.Contains("client_secret="),"Invalid public desktop refresh");refreshed=true;return Json("{\"access_token\":\"fixture-refreshed-access\",\"expires_in\":3600}");}Assert(r.Headers.Authorization!=null&&r.Headers.Authorization.Parameter=="fixture-refreshed-access"&&!r.RequestUri.Query.Contains("access_token"),"Bearer token put in URL or missing");return Json(r.RequestUri.AbsolutePath.EndsWith("/profile")?"{\"historyId\":\"10\"}":"{\"messagesUnread\":0}");}};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"refresh"),h,()=>now,u=>{})){Seed(e,"gmail",now);Private(e).Gmail.ExpiresUtcTicks=0;e.SyncAsync(true).GetAwaiter().GetResult();Assert(refreshed&&e.GetStatus().Gmail.LastSyncUtcTicks==now.Ticks,"Background authorization refresh failed");}
   });

   test("Desktop reconnect does not relabel a previous account's calendar cache",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);bool fail=false;var h=new FakeHandler{Reply=r=>fail?Json("{}",HttpStatusCode.ServiceUnavailable):Json("{\"items\":[{\"id\":\"previous\",\"start\":{\"dateTime\":\"2030-01-16T10:00:00Z\"},\"end\":{\"dateTime\":\"2030-01-16T11:00:00Z\"}}]}")};
    using(var e=new NativeGoogleEngine(DirectoryFor(root,"switch-account"),h,()=>now,u=>{})){Seed(e,"calendar",now);e.SyncAsync(true).GetAwaiter().GetResult();string old=e.GetStatus().Calendar.GrantId;Assert(e.CachedBatch().CalendarEvents.Count==1,"Fixture calendar missing");
     e.ApplyGrant("calendar",new Dictionary<string,object>{{"access_token","fixture-new-account"},{"refresh_token","fixture-new-refresh"},{"scope",NativeGoogleSecurity.Scope("calendar")},{"expires_in",3600}});
     Assert(e.GetStatus().Calendar.GrantId!=old&&!e.CachedBatch().CalendarSnapshotAvailable&&e.CachedBatch().CalendarEvents.Count==0,"Old account cache acquired the new grant ID");fail=true;var b=e.SyncAsync(true).GetAwaiter().GetResult();Assert(!b.CalendarSnapshotAvailable&&b.CalendarEvents.Count==0,"Failed first refresh resurrected another account's calendar");
    }
   });
   test("Desktop service disconnection is local and preserves the other Google service",delegate{
    DateTime now=new DateTime(2030,1,15,8,0,0,DateTimeKind.Utc);var h=new FakeHandler{Reply=r=>Json("{}")};using(var e=new NativeGoogleEngine(DirectoryFor(root,"disconnect"),h,()=>now,u=>{})){Seed(e,"gmail",now);Seed(e,"calendar",now);e.DisconnectAsync("gmail").GetAwaiter().GetResult();Assert(!e.GetStatus().Gmail.Connected&&e.GetStatus().Calendar.Connected&&h.Urls.Count==0,"Disconnect revoked unrelated consent or retained local token");}
   });
  }
 }
}

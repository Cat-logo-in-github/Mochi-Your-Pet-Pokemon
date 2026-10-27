using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
namespace MochiDesktop {
 public sealed class GoogleApplyResult {public bool Changed;public int AddedCalendar,AddedMail;public string Warning="";public List<string> AcknowledgeMailKeys=new List<string>();}
 public static class GoogleNativeIntegration {
  public static string Id(string service,string key){using(var sha=SHA256.Create())return (service=="calendar"?"gcal-":"gmail-")+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(key??""))).Replace("-","").ToLowerInvariant();}
  public static string CalendarClaim(string id,long due){return id+":"+due.ToString(System.Globalization.CultureInfo.InvariantCulture);}
  public static void RememberCalendarClaim(StoredState state,string id,long due){if(state.GoogleSeenCalendarClaims==null)state.GoogleSeenCalendarClaims=new List<string>();string key=CalendarClaim(id,due);if(!state.GoogleSeenCalendarClaims.Contains(key))state.GoogleSeenCalendarClaims.Add(key);if(state.GoogleSeenCalendarClaims.Count>4096)state.GoogleSeenCalendarClaims.RemoveRange(0,state.GoogleSeenCalendarClaims.Count-4096);}
  public static void Normalize(StoredState state){state.GoogleCalendarGrantId=state.GoogleCalendarGrantId??"";state.GoogleGmailGrantId=state.GoogleGmailGrantId??"";state.GoogleSeenCalendarClaims=(state.GoogleSeenCalendarClaims??new List<string>()).Where(s=>s!=null&&Regex.IsMatch(s,@"\Agcal-[0-9a-f]{64}:\d{1,19}\z")).Distinct().ToList();if(state.GoogleSeenCalendarClaims.Count>4096)state.GoogleSeenCalendarClaims=state.GoogleSeenCalendarClaims.Skip(state.GoogleSeenCalendarClaims.Count-4096).ToList();foreach(var r in state.Reminders.Where(r=>r.GoogleService=="calendar"&&r.LastClaimUtcTicks>0))RememberCalendarClaim(state,r.Id,r.LastClaimUtcTicks);state.GoogleSeenMailKeys=(state.GoogleSeenMailKeys??new List<string>()).Where(s=>s!=null&&Regex.IsMatch(s,@"\Agmail-[0-9a-f]{64}\z")).Distinct().ToList();if(state.GoogleSeenMailKeys.Count>4096)state.GoogleSeenMailKeys=state.GoogleSeenMailKeys.Skip(state.GoogleSeenMailKeys.Count-4096).ToList();foreach(var r in state.Reminders)if(r.GoogleService!="calendar"&&r.GoogleService!="gmail"){r.GoogleService=null;r.GoogleStartUtcTicks=0;r.GoogleAllDay=false;}}
  public static bool RemoveService(StoredState state,string service){var ids=new HashSet<string>(state.Reminders.Where(r=>r.GoogleService==service).Select(r=>r.Id));if(ids.Count==0)return false;state.Reminders.RemoveAll(r=>ids.Contains(r.Id));state.PendingAlerts.RemoveAll(n=>ids.Contains(n.ReminderId));return true;}
  static bool Room(StoredState state,GoogleApplyResult result){while(state.Reminders.Count>=1000){var remove=state.Reminders.Where(r=>r.GoogleService!=null&&r.Completed&&!state.PendingAlerts.Any(n=>n.ReminderId==r.Id)).OrderBy(r=>r.DueUtcTicks).FirstOrDefault();if(remove==null){result.Warning="Some Google alerts are waiting. Remove old local reminders to make room (limit1,000).";return false;}state.Reminders.Remove(remove);result.Changed=true;}return true;}
  public static long CalendarDue(NativeCalendarEvent item,NativeGoogleConfig config){if(item.AllDay){DateTime local=TimeZoneInfo.ConvertTimeFromUtc(new DateTime(item.StartUtcTicks,DateTimeKind.Utc),TimeZoneInfo.Local).Date.AddHours(config.AllDayHour);return ReminderEngine.LocalToUtc(local,TimeZoneInfo.Local).Ticks;}return Math.Max(DateTime.MinValue.Ticks,item.StartUtcTicks-TimeSpan.FromMinutes(config.OffsetMinutes).Ticks);}
  public static GoogleApplyResult Apply(StoredState state,NativeGoogleBatch batch,NativeGoogleConfig config,DateTime nowUtc){
   var result=new GoogleApplyResult();if(batch==null)return result;Normalize(state);
   string calendarGrant=batch.CalendarGrantId??"",mailGrant=batch.GmailGrantId??"";
   if(state.GoogleCalendarGrantId!=calendarGrant){RemoveService(state,"calendar");state.GoogleSeenCalendarClaims.Clear();state.GoogleCalendarGrantId=calendarGrant;result.Changed=true;}
   if(state.GoogleGmailGrantId!=mailGrant){RemoveService(state,"gmail");state.GoogleSeenMailKeys.Clear();state.GoogleGmailGrantId=mailGrant;result.Changed=true;}
   if(batch.CalendarSnapshotAvailable){
    var rows=(batch.CalendarEvents??new List<NativeCalendarEvent>()).Where(e=>e!=null&&!string.IsNullOrWhiteSpace(e.Key)&&e.StartUtcTicks>=DateTime.MinValue.Ticks&&e.StartUtcTicks<=DateTime.MaxValue.Ticks&&e.EndUtcTicks>=e.StartUtcTicks&&(batch.HorizonEndUtcTicks<=0||e.StartUtcTicks<=batch.HorizonEndUtcTicks)&&(!e.AllDay||config.AllDayReminders)&&e.EndUtcTicks>=nowUtc.AddDays(-1).Ticks).GroupBy(e=>e.Key).Select(g=>g.First()).OrderBy(e=>e.StartUtcTicks).ToList();
    var keep=new HashSet<string>(rows.Select(e=>Id("calendar",e.Key)));
    foreach(var obsolete in state.Reminders.Where(r=>r.GoogleService=="calendar"&&!keep.Contains(r.Id)&&!state.PendingAlerts.Any(n=>n.ReminderId==r.Id)).ToList()){state.Reminders.Remove(obsolete);result.Changed=true;}
    foreach(var item in rows){long due;try{due=CalendarDue(item,config);}catch{continue;}string id=Id("calendar",item.Key);var reminder=state.Reminders.FirstOrDefault(r=>r.Id==id);
     if(reminder!=null){if(reminder.GoogleService!="calendar")continue;if(reminder.DueUtcTicks!=due){reminder.DueUtcTicks=due;reminder.Completed=false;reminder.LastClaimUtcTicks=0;reminder.LastActionClaimUtcTicks=0;result.Changed=true;}if(reminder.GoogleStartUtcTicks!=item.StartUtcTicks||reminder.GoogleAllDay!=item.AllDay){reminder.GoogleStartUtcTicks=item.StartUtcTicks;reminder.GoogleAllDay=item.AllDay;result.Changed=true;}continue;}
     if(state.GoogleSeenCalendarClaims.Contains(CalendarClaim(id,due)))continue;
     if(!Room(state,result))break;reminder=ReminderEngine.Create(item.AllDay?"Google Calendar all-day reminder":"Google Calendar event",new DateTime(due,DateTimeKind.Utc),"none");reminder.Id=id;reminder.GoogleService="calendar";reminder.GoogleStartUtcTicks=item.StartUtcTicks;reminder.GoogleAllDay=item.AllDay;ReminderActions.Configure(reminder,"https://calendar.google.com/",false);state.Reminders.Add(reminder);result.AddedCalendar++;result.Changed=true;
    }
   }
   if(!config.GmailMuted)foreach(var item in batch.MailAlerts??new List<NativeMailAlert>()){
    if(item==null||string.IsNullOrWhiteSpace(item.Key))continue;string id=Id("gmail",item.Key);
    if(state.GoogleSeenMailKeys.Contains(id)||state.Reminders.Any(r=>r.Id==id)){if(!state.GoogleSeenMailKeys.Contains(id)){state.GoogleSeenMailKeys.Add(id);result.Changed=true;}result.AcknowledgeMailKeys.Add(item.Key);continue;}
    if(!Room(state,result))break;var reminder=ReminderEngine.Create(item.Important?"Important Gmail message":"New Gmail message",nowUtc,"none");reminder.Id=id;reminder.GoogleService="gmail";ReminderActions.Configure(reminder,"https://mail.google.com/",false);state.Reminders.Add(reminder);state.GoogleSeenMailKeys.Add(id);result.AddedMail++;result.Changed=true;result.AcknowledgeMailKeys.Add(item.Key);
   }
   if(state.GoogleSeenMailKeys.Count>4096)state.GoogleSeenMailKeys=state.GoogleSeenMailKeys.Skip(state.GoogleSeenMailKeys.Count-4096).ToList();return result;
  }
 }
}

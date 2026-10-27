using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Threading;
namespace MochiDesktop {
 public sealed partial class CompanionWindow {
  NativeGoogleEngine googleEngine;NativeGoogleConfig googleRuntimeConfig=new NativeGoogleConfig();
  readonly DispatcherTimer googleTimer=new DispatcherTimer(DispatcherPriority.Background);
  bool googleInitialized,googleSyncBusy;string googleCalendarGrant="",googleGmailGrant="",googleHostMessage="Google is optional. Connect with your own Desktop client.",displayedReminderId;
  public bool GoogleBusy {get{return googleSyncBusy;}}
  public string GoogleHostMessage {get{return googleHostMessage;}}
  public NativeGoogleConfig GoogleConfiguration {get{return googleEngine==null?new NativeGoogleConfig():googleEngine.Config;}}
  public NativeGoogleStatus GoogleStatus {get{if(googleEngine!=null)return googleEngine.GetStatus();var status=new NativeGoogleStatus();status.Calendar.Error=googleHostMessage;status.Gmail.Error=googleHostMessage;return status;}}
  public int GoogleScheduledLocalCount {get{return State.Reminders.Count(r=>r.GoogleService=="calendar"&&!r.Completed&&!r.Paused);}}
  void InitializeGoogleRuntime(){if(googleInitialized)return;googleInitialized=true;googleTimer.Tick+=async delegate{await SyncGoogle(false);};try{googleEngine=new NativeGoogleEngine();UpdateGoogleRuntimeView();CommitGoogleBatch(googleEngine.CachedBatch());UpdateGoogleTimer();var pending=SyncGoogle(false);}catch{googleHostMessage="Google connection data could not be loaded. Your own local reminders still work.";}}
  void UpdateGoogleRuntimeView(){if(googleEngine==null)return;googleRuntimeConfig=googleEngine.Config;googleRuntimeConfig.ClientSecret="";var status=googleEngine.GetStatus();googleCalendarGrant=status.Calendar.GrantId??"";googleGmailGrant=status.Gmail.GrantId??"";}
  void UpdateGoogleTimer(){googleTimer.Stop();if(quitting||suspended||googleEngine==null)return;var status=googleEngine.GetStatus();if(!status.Calendar.Connected&&!status.Gmail.Connected)return;googleTimer.Interval=TimeSpan.FromMinutes(googleRuntimeConfig.CheckMinutes);googleTimer.Start();}
  bool CanDeliverGoogleReminder(Reminder reminder){if(reminder.GoogleService=="calendar")return (State.GoogleCalendarGrantId??"")==googleCalendarGrant&&(!reminder.GoogleAllDay||googleRuntimeConfig.AllDayReminders);if(reminder.GoogleService=="gmail")return (State.GoogleGmailGrantId??"")==googleGmailGrant&&!googleRuntimeConfig.GmailMuted;return true;}
  bool CanDeliverNotice(ReminderNotice notice){var reminder=State.Reminders.FirstOrDefault(r=>r.Id==notice.ReminderId);return reminder==null||CanDeliverGoogleReminder(reminder);}
  bool CommitGoogleBatch(NativeGoogleBatch batch){
   if(quitting||googleEngine==null)return false;UpdateGoogleRuntimeView();var active=State.Reminders.FirstOrDefault(r=>r.Id==displayedReminderId);
   if(active!=null&&(active.GoogleService=="calendar"&&(State.GoogleCalendarGrantId??"")!=(batch.CalendarGrantId??"")||active.GoogleService=="gmail"&&(State.GoogleGmailGrantId??"")!=(batch.GmailGrantId??"")))CloseReminderDialogue();
   var result=GoogleNativeIntegration.Apply(State,batch,googleRuntimeConfig,DateTime.UtcNow);
   if(result.Changed&&!Save(false)){State=Store.Load();googleHostMessage="Google is connected, but local alerts could not be saved. Free space or remove old reminders, then check again.";ScheduleReminders();return false;}
   if(result.AcknowledgeMailKeys.Count>0)googleEngine.AcknowledgeMail(result.AcknowledgeMailKeys);
   googleHostMessage=string.IsNullOrEmpty(result.Warning)?GoogleScheduledLocalCount+" Google Calendar reminders scheduled locally. Google mail alerts are kept until dismissed or snoozed.":result.Warning;
   CheckReminders();return true;
  }
  public async Task SyncGoogle(bool force){if(googleEngine==null||googleSyncBusy||suspended||quitting)return;googleSyncBusy=true;try{NativeGoogleBatch batch=await googleEngine.SyncAsync(force);if(!quitting)CommitGoogleBatch(batch);}catch{googleHostMessage="Google could not check right now. Saved calendar reminders and unread alerts remain available.";}finally{googleSyncBusy=false;if(!quitting){UpdateGoogleRuntimeView();UpdateGoogleTimer();}}}
  public void SaveGoogleConfiguration(NativeGoogleConfig config){if(googleEngine==null)throw new InvalidOperationException("Google connection storage is unavailable.");if(googleSyncBusy)throw new InvalidOperationException("Google is checking or signing in. Try again when it finishes.");googleEngine.SaveConfiguration(config);UpdateGoogleRuntimeView();CommitGoogleBatch(googleEngine.CachedBatch());UpdateGoogleTimer();}
  public async Task ConnectGoogle(string service){if(googleEngine==null)throw new InvalidOperationException("Google connection storage is unavailable.");if(googleSyncBusy)throw new InvalidOperationException("Google is already checking or signing in.");googleSyncBusy=true;try{await googleEngine.ConnectAsync(service);if(!quitting){UpdateGoogleRuntimeView();CommitGoogleBatch(googleEngine.CachedBatch());}}finally{googleSyncBusy=false;if(!quitting)UpdateGoogleTimer();}if(!quitting)await SyncGoogle(true);}
  public async Task DisconnectGoogle(string service){if(googleEngine==null)return;if(googleSyncBusy)throw new InvalidOperationException("Wait for the current Google check to finish.");googleSyncBusy=true;try{await googleEngine.DisconnectAsync(service);if(!quitting){UpdateGoogleRuntimeView();CommitGoogleBatch(googleEngine.CachedBatch());}}finally{googleSyncBusy=false;if(!quitting)UpdateGoogleTimer();}}
  public void OpenGoogleConnections(){ShowDialogSafely(new GoogleWindow(this));}
  void StopGoogleRuntime(){googleTimer.Stop();if(googleEngine!=null)googleEngine.Dispose();}
 }
}

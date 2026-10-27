using System;
using System.IO;
using System.Linq;
namespace MochiDesktop {
 public static class InteractionTests {
  static void Assert(bool value,string message){if(!value)throw new Exception(message);}
  public static void Add(Action<string,Action> test,string directory){
   test("Reminder queue survives restart until explicit acknowledgement",delegate{var state=new StoredState();var r=ReminderEngine.Create("Readable reminder",DateTime.UtcNow.AddSeconds(-2),"none");state.Reminders.Add(r);ReminderQueue.Enqueue(state,ReminderEngine.ClaimDue(state,DateTime.UtcNow));var store=new StateStore(Path.Combine(directory,"notice-restart"));store.Save(state);var loaded=store.Load();Assert(loaded.PendingAlerts.Count==1&&loaded.PendingAlerts[0].Title==r.Title&&loaded.Reminders[0].Completed,"Pending alert lost after claim/restart");});
   test("Reminder queue does not duplicate an occurrence",delegate{var s=new StoredState();var r=ReminderEngine.Create("Once",DateTime.UtcNow,"none");s.Reminders.Add(r);ReminderQueue.Enqueue(s,new[]{r,r});Assert(s.PendingAlerts.Count==1,"Duplicate notice");});
   test("Invalid reminder queue references are discarded",delegate{var s=new StoredState();s.PendingAlerts.Add(new ReminderNotice{ReminderId="unknown",Title="invalid",DueUtcTicks=DateTime.UtcNow.Ticks});ReminderQueue.Normalize(s);Assert(s.PendingAlerts.Count==0,"Dangling notice persisted");});
   test("Cursor frequency defaults preserve cadence",delegate{Assert(CursorBehavior.Normalize(null)=="sometimes"&&CursorBehavior.Chance("sometimes")==.35&&CursorBehavior.Cooldown("sometimes")==0,"Default cadence changed");});
   test("Cursor following off and cooldown respected",delegate{var now=DateTime.UtcNow;Assert(!CursorBehavior.Allows("off",now.AddDays(-1),now)&&!CursorBehavior.Allows("rarely",now.AddSeconds(-30),now)&&CursorBehavior.Allows("rarely",now.AddSeconds(-90),now),"Frequency boundary wrong");});
   test("Media action whitelist excludes arbitrary commands",delegate{Assert(NativeMedia.IsAction("pause")&&NativeMedia.IsAction("toggle")&&!NativeMedia.IsAction("execute")&&!NativeMedia.IsAction(null),"Unexpected media action accepted");});
   test("Unavailable media controls stay disabled",delegate{var item=new MediaSessionInfo{CanPlay=true,CanNext=false};Assert(NativeMedia.CanControl(item,"play")&&NativeMedia.CanControl(item,"toggle")&&!NativeMedia.CanControl(new MediaSessionInfo(),"toggle")&&!NativeMedia.CanControl(item,"next")&&!NativeMedia.CanControl(null,"pause"),"Incorrect media capability");});
   test("Media centerpiece follows reported player state and capabilities",delegate{Assert(MediaPresentation.PrimaryAction(new MediaSessionInfo{Playback="Playing",CanPause=true,CanPlay=true})=="pause"&&MediaPresentation.PrimaryAction(new MediaSessionInfo{Playback="Paused",CanPlay=true})=="play"&&MediaPresentation.PrimaryAction(new MediaSessionInfo{Playback="Playing"})==null&&MediaPresentation.PrimaryAction(null)==null,"Primary playback action was invented");});
   test("Unknown media action rejected without touching OS",delegate{bool rejected=false;try{NativeMedia.ControlAsync(null,"run arbitrary").GetAwaiter().GetResult();}catch(ArgumentException){rejected=true;}Assert(rejected,"Unexpected action reached OS");});
   test("Music command dispatches controls instead of searching",delegate{var r=Commands.Parse("pause music",new StoredState(),DateTime.UtcNow);Assert(r.MediaAction=="pause"&&r.Url==null,"Music command became a search");});
  }
 }
}

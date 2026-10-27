// Mochi Windows companion - credited sprite artwork and local-first desktop behavior.
// Build with scripts/build-windows.ps1; .NET Framework 4.8, no third-party runtime packages.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Automation.Provider;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using Forms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace MochiDesktop {
    [DataContract] public sealed class PetSettings {
        [DataMember] public bool Roaming = true;
        [DataMember] public bool Following;
        [DataMember] public string FollowCursorFrequency="sometimes";
        [DataMember] public bool PlayfulActions = true;
        [DataMember] public bool Paused;
        [DataMember] public bool AlwaysOnTop = true;
        [DataMember] public string Skin = "eevee";
        [DataMember] public double Scale = 1;
        [DataMember] public double Opacity = 1;
        [DataMember] public bool RemindersEnabled = true;
        [DataMember] public bool QuietHours;
        [DataMember] public int QuietStart = 22;
        [DataMember] public int QuietEnd = 8;
        [DataMember] public bool HasPosition;
        [DataMember] public int X;
        [DataMember] public int Y;
    }
    [DataContract] public sealed class Reminder {
        [DataMember] public string Id;
        [DataMember] public string Title;
        [DataMember] public long DueUtcTicks;
        [DataMember] public string Recurrence = "none";
        [DataMember] public string TimeZoneId;
        [DataMember] public int Hour;
        [DataMember] public int Minute;
        [DataMember] public bool Completed;
        [DataMember] public bool Paused;
        [DataMember] public long LastClaimUtcTicks;
        [DataMember] public string ActionUrl;
        [DataMember] public bool OpenUrlOnDue;
        [DataMember] public long LastActionClaimUtcTicks;
        [DataMember] public string GoogleService;
        [DataMember] public long GoogleStartUtcTicks;
        [DataMember] public bool GoogleAllDay;
    }
    [DataContract] public sealed class Shortcut {
        [DataMember] public string Name;
        [DataMember] public string Url;
    }
    [DataContract] public sealed class StoredState {
        [DataMember] public int Version = 1;
        [DataMember] public PetSettings Settings = new PetSettings();
        [DataMember] public List<Reminder> Reminders = new List<Reminder>();
        [DataMember] public List<Shortcut> Shortcuts = Defaults.Shortcuts();
        [DataMember] public List<ReminderNotice> PendingAlerts=new List<ReminderNotice>();
        [DataMember] public List<string> GoogleSeenMailKeys=new List<string>(),GoogleSeenCalendarClaims=new List<string>();
        [DataMember] public string GoogleCalendarGrantId="",GoogleGmailGrantId="";
    }
    public static class Defaults {
        public static List<Shortcut> Shortcuts() { return new List<Shortcut> {
            new Shortcut { Name="github",Url="https://github.com/" }, new Shortcut { Name="youtube",Url="https://www.youtube.com/" },
            new Shortcut { Name="gmail",Url="https://mail.google.com/" },new Shortcut { Name="calendar",Url="https://calendar.google.com/" },
            new Shortcut { Name="spotify",Url="https://open.spotify.com/" }
        }; }
    }
    public sealed class StateStore {
        public readonly string DirectoryPath;
        public readonly string FilePath;
        public StateStore(string directory) { DirectoryPath=Path.GetFullPath(directory);FilePath=Path.Combine(DirectoryPath,"state.json"); }
        public StoredState Load() {
            Directory.CreateDirectory(DirectoryPath);
            if (!File.Exists(FilePath)) return new StoredState();
            try {
                if(new FileInfo(FilePath).Length>2000000) throw new InvalidDataException("Mochi data exceeds 2 MB.");
                using(var stream=File.OpenRead(FilePath)) return Normalize((StoredState)new DataContractJsonSerializer(typeof(StoredState)).ReadObject(stream));
            } catch {
                string backup=Path.Combine(DirectoryPath,"state-recovery-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss",CultureInfo.InvariantCulture)+".json");
                try { File.Copy(FilePath,backup,false); } catch { }
                return new StoredState();
            }
        }
        public static StoredState Normalize(StoredState state) {
            if(state==null||state.Version!=1) throw new InvalidDataException("Unsupported Mochi data version.");
            if(state.Settings==null) state.Settings=new PetSettings();
            PetSettings s=state.Settings;
            s.FollowCursorFrequency=CursorBehavior.Normalize(s.FollowCursorFrequency);
            if(!PetTimeline.Species.Contains(s.Skin))s.Skin="eevee";
            s.Scale=double.IsNaN(s.Scale)||double.IsInfinity(s.Scale)?1:Math.Max(.65,Math.Min(1.6,s.Scale));
            s.Opacity=double.IsNaN(s.Opacity)||double.IsInfinity(s.Opacity)?1:Math.Max(.5,Math.Min(1,s.Opacity));
            s.QuietStart=Math.Max(0,Math.Min(23,s.QuietStart));s.QuietEnd=Math.Max(0,Math.Min(23,s.QuietEnd));
            if(state.Reminders==null)state.Reminders=new List<Reminder>();
            foreach(Reminder reminder in state.Reminders)ReminderActions.Normalize(reminder);
            var ids=new HashSet<string>();
            state.Reminders=state.Reminders.Where(r=>ValidReminder(r)&&ids.Add(r.Id)).Take(1000).ToList();
            ReminderQueue.Normalize(state);GoogleNativeIntegration.Normalize(state);
            if(state.Shortcuts==null)state.Shortcuts=Defaults.Shortcuts();
            state.Shortcuts=state.Shortcuts.Where(x=>x!=null&&!string.IsNullOrWhiteSpace(x.Name)&&x.Name.Length<=40&&Commands.SafeUrl(x.Url)!=null).Take(50).Select(x=>new Shortcut{Name=x.Name.Trim().ToLowerInvariant(),Url=Commands.SafeUrl(x.Url)}).ToList();
            return state;
        }
        public static bool ValidReminder(Reminder r) {
            if(r==null||string.IsNullOrEmpty(r.Id)||r.Id.Length>100||string.IsNullOrWhiteSpace(r.Title)||r.Title.Length>300||r.DueUtcTicks<DateTime.MinValue.Ticks||r.DueUtcTicks>DateTime.MaxValue.Ticks)return false;
            if(r.Recurrence!="none"&&r.Recurrence!="daily"&&r.Recurrence!="weekly")return false;
            if(r.Hour<0||r.Hour>23||r.Minute<0||r.Minute>59)return false;
            try { TimeZoneInfo.FindSystemTimeZoneById(r.TimeZoneId); } catch { return false; }
            return true;
        }
        public void Save(StoredState state) {
            Directory.CreateDirectory(DirectoryPath);
            string temp=FilePath+".tmp";
            using(var stream=new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None)) { new DataContractJsonSerializer(typeof(StoredState)).WriteObject(stream,state);stream.Flush(true); }
            if(new FileInfo(temp).Length>2000000)throw new InvalidDataException("Mochi data exceeds the2MB limit. Delete old reminders or shorten website links.");
            if(File.Exists(FilePath))File.Replace(temp,FilePath,null);else File.Move(temp,FilePath);
        }
    }
    public static class ReminderEngine {
        public static Reminder Create(string title,DateTime dueUtc,string recurrence) {
            DateTime local=TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(dueUtc,DateTimeKind.Utc),TimeZoneInfo.Local);
            var r=new Reminder{Id=Guid.NewGuid().ToString("N"),Title=(title??"").Trim(),DueUtcTicks=dueUtc.Ticks,Recurrence=recurrence,TimeZoneId=TimeZoneInfo.Local.Id,Hour=local.Hour,Minute=local.Minute};
            if(!StateStore.ValidReminder(r))throw new ArgumentException("Choose a reminder title, valid time, and recurrence.");return r;
        }
        public static DateTime LocalToUtc(DateTime local,TimeZoneInfo zone) {
            local=DateTime.SpecifyKind(local,DateTimeKind.Unspecified);
            // Move forward through a spring DST gap. Preserve the recurrence's intended hour separately.
            for(int i=0;zone.IsInvalidTime(local)&&i<180;i++)local=local.AddMinutes(1);
            if(zone.IsAmbiguousTime(local)) { TimeSpan offset=zone.GetAmbiguousTimeOffsets(local).Max();return new DateTimeOffset(local,offset).UtcDateTime; }
            return TimeZoneInfo.ConvertTimeToUtc(local,zone);
        }
        public static long NextOccurrence(Reminder r,long afterUtcTicks) {
            if(r.Recurrence=="none")return long.MaxValue;
            TimeZoneInfo zone=TimeZoneInfo.FindSystemTimeZoneById(r.TimeZoneId);
            DateTime anchor=TimeZoneInfo.ConvertTimeFromUtc(new DateTime(r.DueUtcTicks,DateTimeKind.Utc),zone);
            DateTime after=TimeZoneInfo.ConvertTimeFromUtc(new DateTime(afterUtcTicks,DateTimeKind.Utc),zone);
            int step=r.Recurrence=="weekly"?7:1;
            int days=Math.Max(step,((int)(after.Date-anchor.Date).TotalDays/step)*step);
            for(int i=0;i<5;i++,days+=step) {
                DateTime candidate=anchor.Date.AddDays(days).AddHours(r.Hour).AddMinutes(r.Minute);
                long next=LocalToUtc(candidate,zone).Ticks;if(next>afterUtcTicks)return next;
            }
            throw new InvalidOperationException("Could not calculate this recurring reminder.");
        }
        public static List<Reminder> ClaimDue(StoredState state,DateTime nowUtc,Func<Reminder,bool> canDeliver=null) {
            var due=new List<Reminder>();
            foreach(Reminder r in state.Reminders) {
                if(r.Completed||r.Paused||r.DueUtcTicks>nowUtc.Ticks||canDeliver!=null&&!canDeliver(r))continue;
                long occurrence=r.DueUtcTicks;
                if(r.LastClaimUtcTicks!=occurrence)due.Add(new Reminder{Id=r.Id,Title=r.Title,DueUtcTicks=occurrence,TimeZoneId=r.TimeZoneId,Recurrence=r.Recurrence,Hour=r.Hour,Minute=r.Minute,ActionUrl=r.ActionUrl,OpenUrlOnDue=ReminderActions.Claim(r,occurrence)});
                r.LastClaimUtcTicks=occurrence;if(r.GoogleService=="calendar")GoogleNativeIntegration.RememberCalendarClaim(state,r.Id,occurrence);
                if(r.Recurrence=="none")r.Completed=true;else r.DueUtcTicks=NextOccurrence(r,nowUtc.Ticks);
            }
            return due;
        }
        public static bool IsQuiet(PetSettings s,DateTime local) { if(!s.QuietHours)return false;if(s.QuietStart==s.QuietEnd)return true;return s.QuietStart<s.QuietEnd?local.Hour>=s.QuietStart&&local.Hour<s.QuietEnd:local.Hour>=s.QuietStart||local.Hour<s.QuietEnd; }
    }
    public sealed class CommandResult { public GoogleWebPlan GoogleWorkflow;public bool GoogleSetup;public string MediaAction;public string Url;public Reminder Reminder;public string Message; }
    public static class Commands {
        public static string SafeUrl(string input) {
            if(string.IsNullOrWhiteSpace(input)||input.Length>2048||input.Any(c=>char.IsControl(c))||input.Contains("\\"))return null;
            Uri uri;if(!Uri.TryCreate(input.Trim(),UriKind.Absolute,out uri)||uri.Scheme!="http"&&uri.Scheme!="https"||string.IsNullOrEmpty(uri.Host)||!string.IsNullOrEmpty(uri.UserInfo))return null;
            return uri.AbsoluteUri;
        }
        public static CommandResult Parse(string text,StoredState state,DateTime nowUtc) {
            if((text??"").Any(char.IsControl))return new CommandResult{Message="Use a single command line without control characters."};
            text=Regex.Replace((text??"").Trim(),@"\s+"," ");
            if(text.Length==0||text.Length>3000)return new CommandResult{Message="Try 'play Mercy', 'open GitHub', or 'remind me in 10 minutes to stretch'."};
            Match reminder=Regex.Match(text,@"^remind me in (\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w) to (.+)$",RegexOptions.IgnoreCase);
            if(reminder.Success) {
                int amount;if(!int.TryParse(reminder.Groups[1].Value,out amount)||amount<1||amount>100000)return new CommandResult{Message="Choose a positive, reasonable reminder delay."};
                string unit=reminder.Groups[2].Value.ToLowerInvariant();double seconds=amount*(unit.StartsWith("s")?1:unit.StartsWith("m")?60:unit.StartsWith("h")?3600:unit.StartsWith("w")?604800:86400);
                if(seconds>366*86400)return new CommandResult{Message="Schedule reminders within the next year."};
                string body=reminder.Groups[3].Value;string urlError;string actionUrl=ReminderActions.FindExplicitUrl(body,out urlError);if(urlError!=null)return new CommandResult{Message=urlError};
                string label=body;if(actionUrl!=null&&label.Length>300)label=Regex.Replace(body,@"\bhttps?://[^\s<>""']+","",RegexOptions.IgnoreCase).Trim()+" "+new Uri(actionUrl).Host;
                try{var saved=ReminderEngine.Create(label,nowUtc.AddSeconds(seconds),"none");if(actionUrl!=null)ReminderActions.Configure(saved,actionUrl,true);return new CommandResult{Reminder=saved,Message=actionUrl==null?"Reminder saved.":"Reminder saved. Mochi will open "+actionUrl+" once when it is due."};}catch{return new CommandResult{Message="Give the reminder a title up to300 characters and a valid website link."};}
            }
            var googleWorkflow=GoogleWebWorkflows.TryParse(text,nowUtc);if(googleWorkflow!=null)return googleWorkflow;
            if(Regex.IsMatch(text,@"^remind me (about|to read|to revisit) this (page|tab)",RegexOptions.IgnoreCase))return new CommandResult{Message="Use the browser extension for page reminders. It can keep the page link with your reminder."};
            string lower=text.ToLowerInvariant();
            if(Regex.IsMatch(lower,@"^(pause|stop|resume|play)( the)? music$")){string action=lower.StartsWith("pause")?"pause":lower.StartsWith("stop")?"stop":"play";return new CommandResult{MediaAction=action,Message="Media controls opened. The selected Windows player handles playback."};}
            if(Regex.IsMatch(lower,@"^(next|skip|previous)( track| song)$"))return new CommandResult{MediaAction=lower.StartsWith("previous")?"previous":"next",Message="Media controls opened."};
            Match play=Regex.Match(text,@"^(?:play|search youtube for) (.+?)[.!]?$",RegexOptions.IgnoreCase);
            if(play.Success)return new CommandResult{Url="https://www.youtube.com/results?search_query="+Uri.EscapeDataString(play.Groups[1].Value+" full song"),Message="Finding the song on YouTube. Choose a recording, then use Mochi Media controls for its supported Windows session."};
            Match open=Regex.Match(text,@"^(?:open|go to) (.+)$",RegexOptions.IgnoreCase);
            if(open.Success) {
                string destination=open.Groups[1].Value.Trim();Shortcut shortcut=state.Shortcuts.FirstOrDefault(x=>string.Equals(x.Name,destination.TrimEnd('.','!'),StringComparison.OrdinalIgnoreCase));
                string url=shortcut!=null?SafeUrl(shortcut.Url):SafeUrl(destination);
                return url!=null?new CommandResult{Url=url,Message="Opening "+(shortcut!=null?shortcut.Name:new Uri(url).Host)+"."}:new CommandResult{Message="Use a saved shortcut or a full http:// or https:// address. Other URL schemes are blocked."};
            }
            return new CommandResult{Message="Try 'play Mercy by Shawn Mendes', 'open GitHub', or 'remind me in 10 minutes to stretch'. Use Media controls to choose a Windows player session. Use Google connections for native Calendar and Gmail alerts."};
        }
    }
    internal static class Native {
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
        [DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
        [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
        [DllImport("user32.dll")]public static extern bool RegisterHotKey(IntPtr hwnd,int id,uint modifiers,uint key);
        [DllImport("user32.dll")]public static extern bool UnregisterHotKey(IntPtr hwnd,int id);
        public const uint MoveFlags=0x0001|0x0004|0x0010;
    }
    public sealed class CatArtPeer : FrameworkElementAutomationPeer, IInvokeProvider {
        public CatArtPeer(CatArt owner):base(owner) { }
        protected override string GetNameCore(){return "Mochi - interact or drag";}
        protected override string GetClassNameCore(){return "MochiSprite";}
        protected override Point GetClickablePointCore(){try{return ((CatArt)Owner).PointToScreen(((CatArt)Owner).InteractionPoint);}catch(InvalidOperationException){return base.GetClickablePointCore();}}
        protected override AutomationControlType GetAutomationControlTypeCore(){return AutomationControlType.Button;}
        protected override bool IsControlElementCore(){return true;}
        protected override bool IsContentElementCore(){return true;}
        protected override bool IsKeyboardFocusableCore(){return true;}
        protected override string GetHelpTextCore(){return "Drag to carry Mochi. Press Enter, Space or Shift+F10 to open interactions. Escape closes the menu.";}
        public override object GetPattern(PatternInterface pattern){return pattern==PatternInterface.Invoke?this:base.GetPattern(pattern);}
        void IInvokeProvider.Invoke(){
            if(!IsEnabled())throw new ElementNotEnabledException();
            CatArt cat=(CatArt)Owner;
            if(!cat.Dispatcher.HasShutdownStarted)cat.Dispatcher.BeginInvoke(new Action(cat.InvokeInteraction));
        }
    }
    public sealed class CatArt : FrameworkElement {
        public Action Interact;
        readonly AtlasPlayer player;string skin="eevee",mood="idle",direction="front";
        public CatArt(){Focusable=true;FocusVisualStyle=null;RenderOptions.SetBitmapScalingMode(this,BitmapScalingMode.NearestNeighbor);player=new AtlasPlayer(this,InvalidateVisual);player.Play(mood,skin,direction,false);}
        public bool ArtworkReady {get{return player.Available&&player.HasFrame&&player.Error==null;}}
        public bool HasAssets {get{return player.Available;}}
        public Rect VisibleBounds {get{return player.VisibleBounds;}}
        public string[] ExtraActions {get{return player.ExtraActions(skin);}}
        public Point InteractionPoint {get{Point point=player.HasFrame?player.InteractionPoint:new Point(.5,110.0/180);return new Point(point.X*ActualWidth,point.Y*ActualHeight);}}
        public bool WaitingForFrame {get{return player.WaitingForFrame;}}
        public double PlaybackElapsedSeconds {get{return player.ElapsedSeconds;}}
        public bool ArtworkComplete {get{return player.Complete;}}
        public string ArtworkError {get{return player.Error;}}
        public double ClipDurationSeconds {get{return player.DurationSeconds;}}
        public string Skin {get{return skin;}set{if(skin==value)return;skin=value;player.Play(mood,skin,direction,false);InvalidateVisual();}}
        public string Mood {get{return mood;}set{mood=value;player.Play(mood,skin,direction,false);InvalidateVisual();}}
        public string Direction {get{return direction;}set{if(direction==value)return;direction=value;player.Play(mood,skin,direction,false);}}
        public double Facing {set{Direction=value<0?"left":"right";}}
        public double Step;public double TailAngle;public bool Blink;
        public void Play(string action,string heading,bool restart){mood=action;direction=heading;player.Play(mood,skin,direction,restart);InvalidateVisual();}
        public void SetActive(bool active){player.SetActive(active);}
        public void Dispose(){player.Dispose();}
        public void InvokeInteraction(){Focus();if(Interact!=null)Interact();}
        protected override AutomationPeer OnCreateAutomationPeer(){return new CatArtPeer(this);}
        protected override void OnGotKeyboardFocus(KeyboardFocusChangedEventArgs e){base.OnGotKeyboardFocus(e);InvalidateVisual();}
        protected override void OnLostKeyboardFocus(KeyboardFocusChangedEventArgs e){base.OnLostKeyboardFocus(e);InvalidateVisual();}
        protected override void OnRender(DrawingContext dc){
            base.OnRender(dc);
            if(player.Available&&(player.HasFrame||player.Error==null)){player.Draw(dc,new Rect(0,0,ActualWidth,ActualHeight));return;}
            // Neutral recovery marker. It never impersonates a missing character sprite.
            double unit=Math.Min(ActualWidth,ActualHeight)/180;dc.PushTransform(new ScaleTransform(unit,unit));
            dc.DrawEllipse(MochiTheme.Lavender,null,new Point(90,110),26,20);
            dc.DrawEllipse(MochiTheme.Lavender,null,new Point(57,86),10,14);dc.DrawEllipse(MochiTheme.Lavender,null,new Point(79,70),10,14);
            dc.DrawEllipse(MochiTheme.Lavender,null,new Point(102,70),10,14);dc.DrawEllipse(MochiTheme.Lavender,null,new Point(124,86),10,14);dc.Pop();
        }
    }
    public sealed partial class CompanionWindow : Window {
        public const double BaseCompanionSize=256;
        public StoredState State;
        public readonly StateStore Store;
        public readonly bool CustomDataDirectory;
        readonly CatArt art=new CatArt();
        readonly Random random=new Random();
        readonly DispatcherTimer idleTimer=new DispatcherTimer(DispatcherPriority.Background);
        readonly DispatcherTimer blinkTimer=new DispatcherTimer(DispatcherPriority.Background);
        readonly DispatcherTimer motionTimer=new DispatcherTimer(DispatcherPriority.Background);
        readonly DispatcherTimer reminderTimer=new DispatcherTimer(DispatcherPriority.Background);
        readonly List<DispatcherTimer> shortTimers=new List<DispatcherTimer>();
        readonly Stopwatch motionClock=new Stopwatch();
        Forms.NotifyIcon tray;Drawing.Icon trayIcon;IntPtr handle;HwndSource source;
        bool quitting,locked,suspended,walking,hotkeyRegistered,carrying,waitingForWalkFrame;
        CompanionPanel activePanel;ReminderDialogue reminderDialogue;bool suppressNoticeReopen,alertsHidden;int interactionDepth;
        string lastNotificationStatus="Ready. Scheduled reminders appear beside Mochi and request a Windows notification.";
        readonly Queue<string> poseSequence=new Queue<string>();
        DateTime lastPlayfulAt=DateTime.MinValue,lastFollowAt=DateTime.MinValue;
        DateTime retrySaveAt=DateTime.MinValue;
        int fromX,fromY,targetX,targetY;double motionSeconds;string pose="idle";
        DateTime lastNavigation=DateTime.MinValue;string lastNavigationUrl;
        public CompanionWindow(StateStore store,bool customDataDirectory) {
            Store=store;CustomDataDirectory=customDataDirectory;State=store.Load();
            Title="Mochi desktop companion";WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;
            ResizeMode=ResizeMode.NoResize;ShowInTaskbar=true;Topmost=State.Settings.AlwaysOnTop;Width=BaseCompanionSize*State.Settings.Scale;Height=BaseCompanionSize*State.Settings.Scale;Opacity=State.Settings.Opacity;
            art.Width=256;art.Height=256;art.Skin=State.Settings.Skin;
            art.Interact=delegate{StopMotion();OpenMenu();};
            art.KeyDown+=delegate(object sender,KeyEventArgs e){
                if(e.Key==Key.Enter||e.Key==Key.Space||e.Key==Key.Apps||e.Key==Key.F10&&(Keyboard.Modifiers&ModifierKeys.Shift)!=0){art.InvokeInteraction();e.Handled=true;}
                else if(e.Key==Key.Escape&&activePanel!=null){activePanel.Close();e.Handled=true;}
            };
            Content=new Viewbox{Child=art,Stretch=Stretch.Uniform};
            SourceInitialized+=OnSourceInitialized;Loaded+=OnLoaded;StateChanged+=delegate{if(WindowState==WindowState.Minimized){StopMotion();idleTimer.Stop();art.SetActive(false);}else{ResetIdle();ResetBlink();}};
            MouseLeftButtonDown+=OnPetMouseDown;MouseRightButtonUp+=delegate(object s,MouseButtonEventArgs e){StopMotion();OpenMenu();e.Handled=true;};
            Closing+=delegate{if(!quitting){quitting=true;Cleanup();Application.Current.Shutdown();}};
            idleTimer.Tick+=OnIdle;blinkTimer.Tick+=OnBlink;motionTimer.Interval=TimeSpan.FromMilliseconds(33);motionTimer.Tick+=OnMotion;
            reminderTimer.Tick+=delegate{CheckReminders();};
            SystemEvents.PowerModeChanged+=OnPowerMode;SystemEvents.SessionSwitch+=OnSessionSwitch;
        }
        void OnSourceInitialized(object sender,EventArgs e) {
            handle=new WindowInteropHelper(this).Handle;source=HwndSource.FromHwnd(handle);source.AddHook(WindowHook);
            hotkeyRegistered=Native.RegisterHotKey(handle,101,0x0002|0x0001|0x4000,0x4D); // Ctrl+Alt+M, MOD_NOREPEAT.
            SetupTray();
        }
        void OnLoaded(object sender,RoutedEventArgs e) {
            if(State.Settings.HasPosition)MoveNative(State.Settings.X,State.Settings.Y);
            else {var area=Forms.Screen.PrimaryScreen.WorkingArea;Native.RECT rect;Native.GetWindowRect(handle,out rect);MoveNative(area.Right-(rect.Right-rect.Left)-38,area.Bottom-(rect.Bottom-rect.Top)-18);}
            EnsureVisible();InitializeGoogleRuntime();ApplySettings();SavePosition();CheckReminders();
        }
        IntPtr WindowHook(IntPtr hwnd,int msg,IntPtr wparam,IntPtr lparam,ref bool handled) {
            if(msg==0x0312&&wparam.ToInt32()==101){ShowCat();handled=true;}return IntPtr.Zero;
        }
        void SetupTray() {
            using(Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Mochi.Icon"))using(var icon=new Drawing.Icon(stream))trayIcon=(Drawing.Icon)icon.Clone();
            tray=new Forms.NotifyIcon{Icon=trayIcon,Text="Mochi - your sprite companion",Visible=true};
            var menu=new Forms.ContextMenuStrip();
            menu.Items.Add("Show Mochi / recall",null,delegate{Dispatcher.BeginInvoke(new Action(ShowCat));});
            menu.Items.Add("Pet and feed",null,delegate{Dispatcher.BeginInvoke(new Action(delegate{ShowCat();AnimatePose("feed",2.3);}));});
            menu.Items.Add("Add reminder",null,delegate{Dispatcher.BeginInvoke(new Action(AddReminder));});
            menu.Items.Add("Reminders",null,delegate{Dispatcher.BeginInvoke(new Action(OpenReminders));});
            menu.Items.Add("Media controls",null,delegate{Dispatcher.BeginInvoke(new Action(OpenMedia));});
            menu.Items.Add("Pause / wake",null,delegate{Dispatcher.BeginInvoke(new Action(TogglePause));});
            menu.Items.Add("Settings",null,delegate{Dispatcher.BeginInvoke(new Action(OpenSettings));});
            menu.Items.Add("Hide Mochi",null,delegate{Dispatcher.BeginInvoke(new Action(HideCat));});
            menu.Items.Add(new Forms.ToolStripSeparator());
            menu.Items.Add("Quit Mochi",null,delegate{Dispatcher.BeginInvoke(new Action(Quit));});
            tray.ContextMenuStrip=menu;
            tray.DoubleClick+=delegate{Dispatcher.BeginInvoke(new Action(ShowCat));};
            tray.BalloonTipShown+=delegate{Dispatcher.BeginInvoke(new Action(delegate{lastNotificationStatus="Windows reported the notification shown at "+DateTime.Now.ToString("HH:mm")+".";Log("Windows reported OS notification shown.");}));};
            tray.BalloonTipClicked+=delegate{Dispatcher.BeginInvoke(new Action(delegate{ShowCat();ShowPendingReminder();}));};

        }
        void OnPetMouseDown(object sender,MouseButtonEventArgs e) {
            art.Focus();carrying=true;idleTimer.Stop();blinkTimer.Stop();StopMotion(false,false);art.Play("carry",art.Direction,true);art.SetActive(ArtworkCanAnimate);Drawing.Point start=Forms.Cursor.Position;Native.RECT dragStartRect;Native.GetWindowRect(handle,out dragStartRect);
            try { DragMove(); } catch(InvalidOperationException) { }
            Drawing.Point end=Forms.Cursor.Position;carrying=false;EnsureVisible();Native.RECT dragEndRect;Native.GetWindowRect(handle,out dragEndRect);SavePosition();if(reminderDialogue!=null)reminderDialogue.Anchor();ResetIdle();ResetBlink();
            if(Math.Abs(start.X-end.X)<5&&Math.Abs(start.Y-end.Y)<5&&Math.Abs(dragStartRect.Left-dragEndRect.Left)<5&&Math.Abs(dragStartRect.Top-dragEndRect.Top)<5)OpenMenu();
            else {AnimatePose("stretch",0);}
            e.Handled=true;
        }
        bool CanAnimate {get{return IsVisible&&WindowState!=WindowState.Minimized&&!State.Settings.Paused&&!locked&&!suspended&&!quitting&&!carrying&&(reminderDialogue==null||!reminderDialogue.IsVisible)&&(activePanel==null||!activePanel.IsVisible);}}
        bool ArtworkCanAnimate {get{return IsVisible&&WindowState!=WindowState.Minimized&&!State.Settings.Paused&&!locked&&!suspended&&!quitting&&(activePanel==null||!activePanel.IsVisible);}}
        public bool ArtworkReady {get{return art.ArtworkReady;}}
        public bool ArtworkComplete {get{return art.ArtworkComplete;}}
        public bool HasExtraActions {get{return art.ExtraActions.Length>0;}}
        public string SpeciesName {get{return PetTimeline.SpeciesName(State.Settings.Skin);}}
        public void SurpriseMe(){string[] actions=art.ExtraActions;if(actions.Length>0)AnimatePose(actions[random.Next(actions.Length)],0);}
        public void OpenCredits(){new CreditsWindow(this).ShowDialog();}
        public System.Drawing.Rectangle GetDesktopBounds(){Native.RECT r;Native.GetWindowRect(handle,out r);return new System.Drawing.Rectangle(r.Left,r.Top,r.Right-r.Left,r.Bottom-r.Top);}
        public void ApplyPreferences(){Save(false);ApplySettings();}
        public void HideCompanion(){HideCat();}
        void ResetIdle() {idleTimer.Stop();if(CanAnimate){idleTimer.Interval=TimeSpan.FromSeconds(random.Next(8,17));idleTimer.Start();}}
        void ResetBlink(){blinkTimer.Stop();art.SetActive(ArtworkCanAnimate);}
        void OnBlink(object sender,EventArgs e){blinkTimer.Stop();}
        void OnIdle(object sender,EventArgs e) {
            idleTimer.Stop();if(!CanAnimate)return;
            if(State.Settings.PlayfulActions&&State.Settings.FollowCursorFrequency!="off"&&CursorBehavior.Allows(State.Settings.FollowCursorFrequency,lastPlayfulAt,DateTime.UtcNow)&&(DateTime.UtcNow-lastPlayfulAt).TotalSeconds>=30&&random.NextDouble()<.23){
                lastPlayfulAt=DateTime.UtcNow;Drawing.Point cursor=Forms.Cursor.Position;
                if(random.Next(2)==0){StartWalk(cursor.X-125,cursor.Y-115,true);poseSequence.Enqueue("pounce");poseSequence.Enqueue("play");}
                else {art.Direction=PetTimeline.Heading(cursor.X-GetDesktopBounds().Left,cursor.Y-GetDesktopBounds().Top);AnimatePose("play",0);}
                return;
            }
            if(State.Settings.Following&&CursorBehavior.Allows(State.Settings.FollowCursorFrequency,lastFollowAt,DateTime.UtcNow)&&random.NextDouble()<CursorBehavior.Chance(State.Settings.FollowCursorFrequency)){lastFollowAt=DateTime.UtcNow;Drawing.Point cursor=Forms.Cursor.Position;StartWalk(cursor.X-110,cursor.Y-130,true);return;}
            if(State.Settings.Roaming&&random.NextDouble()<.65) {
                Native.RECT rect;Native.GetWindowRect(handle,out rect);
                var area=Forms.Screen.FromHandle(handle).WorkingArea;
                int width=rect.Right-rect.Left,height=rect.Bottom-rect.Top;
                int x,y;
                if(random.NextDouble()<.28) {
                    // Occasionally explore a full work area, including another attached monitor.
                    Forms.Screen screen=Forms.Screen.AllScreens[random.Next(Forms.Screen.AllScreens.Length)];area=screen.WorkingArea;
                    x=area.Left+random.Next(Math.Max(1,area.Width-width));
                    y=area.Top+random.Next(Math.Max(1,area.Height-height));
                } else {
                    int dx=random.Next(80,251)*(random.Next(2)==0?-1:1),dy=random.Next(-100,101);
                    x=Math.Max(area.Left,Math.Min(area.Right-width,rect.Left+dx));
                    y=Math.Max(area.Top,Math.Min(area.Bottom-height,rect.Top+dy));
                }
                StartWalk(x,y);return;
            }
            string[] moods={"groom","turn","stretch","sleep"};AnimatePose(moods[random.Next(moods.Length)],0);
        }
        void StartWalk(int x,int y,bool run=false) {
            if(!CanAnimate)return;StopMotion(false,false);Native.RECT rect;Native.GetWindowRect(handle,out rect);
            var area=Forms.Screen.FromPoint(new Drawing.Point(x,y)).WorkingArea;
            fromX=rect.Left;fromY=rect.Top;targetX=Math.Max(area.Left,Math.Min(area.Right-(rect.Right-rect.Left),x));targetY=Math.Max(area.Top,Math.Min(area.Bottom-(rect.Bottom-rect.Top),y));
            walking=true;pose=run?"run":"walk";art.Play(pose,PetTimeline.Heading(targetX-fromX,targetY-fromY),true);art.SetActive(ArtworkCanAnimate);
            double distance=Math.Sqrt((targetX-fromX)*(double)(targetX-fromX)+(targetY-fromY)*(double)(targetY-fromY));
            motionSeconds=Math.Max(1.2,Math.Min(9,distance/(run?175:105)));waitingForWalkFrame=art.HasAssets&&art.WaitingForFrame;motionClock.Restart();motionTimer.Start();
        }
        void OnMotion(object sender,EventArgs e) {
            if(!CanAnimate){StopMotion();return;}if(walking&&waitingForWalkFrame){if(art.WaitingForFrame&&art.ArtworkError==null)return;waitingForWalkFrame=false;motionClock.Restart();}
            double elapsed=walking||!art.HasAssets||art.ArtworkError!=null?motionClock.Elapsed.TotalSeconds:art.PlaybackElapsedSeconds,p=Math.Min(1,elapsed/motionSeconds);
            if(walking){double eased=p*p*(3-2*p);MoveNative((int)(fromX+(targetX-fromX)*eased),(int)(fromY+(targetY-fromY)*eased));}
            if(p>=1){bool moved=walking;string next=poseSequence.Count>0?poseSequence.Dequeue():null;StopMotion(next==null,true);if(moved)SavePosition();if(next!=null){StartPose(next,0);return;}ResetIdle();}
        }
        public void AnimatePose(string mood,double seconds){
            idleTimer.Stop();if(!IsVisible)ShowCat();if(State.Settings.Paused&&mood!="sleeping"&&mood!="sleep")return;
            poseSequence.Clear();string action=PetTimeline.ActionForMood(mood);if(action=="feed"||action=="play")poseSequence.Enqueue("happy");StartPose(action,seconds);
        }
        void StartPose(string action,double minimumSeconds){StopMotion(false,true);walking=false;pose=action;art.Play(action,art.Direction,true);art.SetActive(ArtworkCanAnimate);motionSeconds=Math.Max(Math.Max(.6,minimumSeconds),art.ClipDurationSeconds);motionClock.Restart();if(CanAnimate)motionTimer.Start();}
        void StopMotion(bool resetArtwork=true,bool preserveSequence=false){motionTimer.Stop();motionClock.Stop();walking=false;if(!preserveSequence)poseSequence.Clear();if(resetArtwork)art.Play(State.Settings.Paused?"sleep":"idle",art.Direction,false);art.SetActive(ArtworkCanAnimate);}
        void OneShot(int ms,Action action){var timer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(ms)};shortTimers.Add(timer);timer.Tick+=delegate{timer.Stop();shortTimers.Remove(timer);if(!quitting)action();};timer.Start();}
        void MoveNative(int x,int y){if(handle!=IntPtr.Zero)Native.SetWindowPos(handle,IntPtr.Zero,x,y,0,0,Native.MoveFlags);}
        void EnsureVisible(){Native.RECT rect;Native.GetWindowRect(handle,out rect);var bounds=new Drawing.Rectangle(rect.Left,rect.Top,rect.Right-rect.Left,rect.Bottom-rect.Top);var area=Forms.Screen.FromRectangle(bounds).WorkingArea;int x=Math.Max(area.Left,Math.Min(area.Right-bounds.Width,rect.Left));int y=Math.Max(area.Top,Math.Min(area.Bottom-bounds.Height,rect.Top));if(x!=rect.Left||y!=rect.Top)MoveNative(x,y);}
        void SavePosition(){Native.RECT rect;if(handle!=IntPtr.Zero&&Native.GetWindowRect(handle,out rect)){State.Settings.HasPosition=true;State.Settings.X=rect.Left;State.Settings.Y=rect.Top;Save(false);}}
        public bool Save(bool showError){try{Store.Save(State);return true;}catch{Log("Local data could not be saved. Check the Mochi data directory and free disk space.");if(showError)MessageBox.Show(this,"Mochi could not save local data. Check free disk space and folder permissions.","Mochi",MessageBoxButton.OK,MessageBoxImage.Warning);return false;}}
        public void ApplySettings(){Width=BaseCompanionSize*State.Settings.Scale;Height=BaseCompanionSize*State.Settings.Scale;Opacity=State.Settings.Opacity;Topmost=State.Settings.AlwaysOnTop;art.Skin=State.Settings.Skin;StopMotion();ResetIdle();ResetBlink();if(!State.Settings.RemindersEnabled)CloseReminderDialogue();else CheckReminders();ScheduleReminders();}
        void TogglePause(){State.Settings.Paused=!State.Settings.Paused;ApplySettings();Save(false);}
        public void ShowCat(){
            alertsHidden=false;StopMotion();Show();if(WindowState==WindowState.Minimized)WindowState=WindowState.Normal;Topmost=true;OneShot(5000,delegate{if(reminderDialogue==null)Topmost=State.Settings.AlwaysOnTop;});
            Native.RECT rect;Native.GetWindowRect(handle,out rect);Drawing.Point cursor=Forms.Cursor.Position;var area=Forms.Screen.FromPoint(cursor).WorkingArea;
            int x=Math.Max(area.Left,Math.Min(area.Right-(rect.Right-rect.Left),cursor.X+24));
            int y=Math.Max(area.Top,Math.Min(area.Bottom-(rect.Bottom-rect.Top),cursor.Y+20));
            MoveNative(x,y);EnsureVisible();SavePosition();art.Focus();ResetIdle();ResetBlink();ShowPendingReminder();
        }
        void HideCat(){alertsHidden=true;CloseReminderDialogue();if(activePanel!=null)activePanel.Close();StopMotion();idleTimer.Stop();blinkTimer.Stop();art.SetActive(false);Hide();}
        public void Quit(){if(quitting)return;quitting=true;SavePosition();Cleanup();Application.Current.Shutdown();}
        void Cleanup(){StopGoogleRuntime();CloseReminderDialogue();if(activePanel!=null)activePanel.Close();art.Dispose();idleTimer.Stop();blinkTimer.Stop();motionTimer.Stop();reminderTimer.Stop();foreach(var t in shortTimers)t.Stop();shortTimers.Clear();if(hotkeyRegistered)Native.UnregisterHotKey(handle,101);if(source!=null)source.RemoveHook(WindowHook);SystemEvents.PowerModeChanged-=OnPowerMode;SystemEvents.SessionSwitch-=OnSessionSwitch;if(tray!=null){tray.Visible=false;tray.Dispose();}if(trayIcon!=null)trayIcon.Dispose();}
        void OnPowerMode(object sender,PowerModeChangedEventArgs e){Dispatcher.BeginInvoke(new Action(delegate{suspended=e.Mode==PowerModes.Suspend;if(suspended){googleTimer.Stop();StopMotion();idleTimer.Stop();blinkTimer.Stop();art.SetActive(false);}else if(e.Mode==PowerModes.Resume){UpdateGoogleTimer();var pending=SyncGoogle(false);CheckReminders();ResetIdle();ResetBlink();}}));}
        void OnSessionSwitch(object sender,SessionSwitchEventArgs e){Dispatcher.BeginInvoke(new Action(delegate{if(e.Reason==SessionSwitchReason.SessionLock){locked=true;StopMotion();idleTimer.Stop();blinkTimer.Stop();art.SetActive(false);}else if(e.Reason==SessionSwitchReason.SessionUnlock){locked=false;CheckReminders();ResetIdle();ResetBlink();}}));}
        public string NotificationStatus {get{if(!State.Settings.RemindersEnabled)return "Reminder delivery is paused. Due reminders are kept until enabled.";if(ReminderEngine.IsQuiet(State.Settings,DateTime.Now))return "Quiet hours: due reminders are kept for later.";return lastNotificationStatus;}}
        public int PendingReminderCount {get{return State.PendingAlerts.Count;}}
        public Drawing.Rectangle GetVisiblePetDesktopBounds(){Rect r=art.VisibleBounds;Point first=art.PointToScreen(new Point(r.X*art.ActualWidth,r.Y*art.ActualHeight)),last=art.PointToScreen(new Point(r.Right*art.ActualWidth,r.Bottom*art.ActualHeight));return new Drawing.Rectangle((int)first.X,(int)first.Y,Math.Max(1,(int)(last.X-first.X)),Math.Max(1,(int)(last.Y-first.Y)));}
        void EnsurePetForReminder(){
            StopMotion();bool activate=ShowActivated;ShowActivated=false;if(!IsVisible)Show();if(WindowState==WindowState.Minimized)WindowState=WindowState.Normal;ShowActivated=activate;Topmost=true;EnsureVisible();SavePosition();art.Play("alert",art.Direction,true);art.SetActive(ArtworkCanAnimate);
        }
        void CloseReminderDialogue(){if(reminderDialogue==null)return;suppressNoticeReopen=true;reminderDialogue.Close();suppressNoticeReopen=false;reminderDialogue=null;displayedReminderId=null;if(!quitting)Topmost=State.Settings.AlwaysOnTop;}
        void ShowNotice(ReminderNotice notice,bool test){
            CloseReminderDialogue();displayedReminderId=notice.ReminderId;EnsurePetForReminder();var dialogue=new ReminderDialogue(notice,test,State.PendingAlerts.Count,delegate{
                if(test)return true;State.PendingAlerts.Remove(notice);if(Save(true))return true;State.PendingAlerts.Add(notice);return false;
            },delegate{
                if(State.Reminders.Count>=1000)return "Delete an old reminder first (limit1,000).";
                var snoozed=ReminderActions.Snooze(notice.Title,notice.ActionUrl,DateTime.UtcNow.AddMinutes(5));State.Reminders.Add(snoozed);State.PendingAlerts.Remove(notice);
                if(!Save(true)){State.Reminders.Remove(snoozed);State.PendingAlerts.Add(notice);return "Could not save snooze. Your alert is still pending.";}ScheduleReminders();return null;
            },GetVisiblePetDesktopBounds);reminderDialogue=dialogue;dialogue.Owner=this;dialogue.Closed+=delegate{
                if(reminderDialogue==dialogue){reminderDialogue=null;displayedReminderId=null;}Topmost=State.Settings.AlwaysOnTop;StopMotion();ResetIdle();if(!quitting&&!suppressNoticeReopen)Dispatcher.BeginInvoke(new Action(ShowPendingReminder));
            };dialogue.Show();
        }
        public void ShowPendingReminder(){if(interactionDepth>0||(activePanel!=null&&activePanel.IsVisible)||quitting||alertsHidden||!State.Settings.RemindersEnabled||locked||suspended||ReminderEngine.IsQuiet(State.Settings,DateTime.Now)||reminderDialogue!=null)return;var next=State.PendingAlerts.FirstOrDefault(CanDeliverNotice);if(next!=null)ShowNotice(next,false);}
        void RequestOsNotification(string title,bool test){try{tray.ShowBalloonTip(12000,test?"Mochi notification test":"A little reminder from Mochi",title.Length>240?title.Substring(0,237)+"...":title,Forms.ToolTipIcon.Info);lastNotificationStatus="Windows notification requested at "+DateTime.Now.ToString("HH:mm")+". Windows may hide it during Do not disturb; the pixel dialogue stays visible.";Log(test?"Test OS notification requested.":"Scheduled OS notification requested.");}catch{lastNotificationStatus="Windows notification request failed. The pixel dialogue remains available.";Log("Windows refused a reminder notification. Check notification settings.");}}
        public string TestNotification(){alertsHidden=false;var notice=new ReminderNotice{Title="A little reminder from Mochi",DueUtcTicks=DateTime.UtcNow.Ticks};RequestOsNotification("Test: your desktop reminder is ready.",true);ShowNotice(notice,true);return "Test requested. The pixel dialogue is visible; Windows controls whether the separate OS notification is shown. Tests ignore Mochi quiet/pause settings.";}
        public void ScheduleReminders(){
            reminderTimer.Stop();if(!State.Settings.RemindersEnabled||quitting||locked||suspended)return;
            List<Reminder> pending=State.Reminders.Where(r=>!r.Completed&&!r.Paused&&CanDeliverGoogleReminder(r)).ToList();if(pending.Count==0&&(!State.PendingAlerts.Any(CanDeliverNotice)||alertsHidden||reminderDialogue!=null))return;
            double seconds=pending.Count==0?60:(new DateTime(pending.Min(r=>r.DueUtcTicks),DateTimeKind.Utc)-DateTime.UtcNow).TotalSeconds;
            if(ReminderEngine.IsQuiet(State.Settings,DateTime.Now)||retrySaveAt>DateTime.UtcNow)seconds=60;
            reminderTimer.Interval=TimeSpan.FromSeconds(Math.Max(1,Math.Min(60,seconds)));reminderTimer.Start();
        }
        public void CheckReminders(){
            reminderTimer.Stop();if(!State.Settings.RemindersEnabled||locked||suspended||ReminderEngine.IsQuiet(State.Settings,DateTime.Now)){ScheduleReminders();return;}
            List<Reminder> due=ReminderEngine.ClaimDue(State,DateTime.UtcNow,CanDeliverGoogleReminder);
            if(due.Count>0){
                // Commit both occurrence claims and the unread alert queue before any UI or OS delivery.
                ReminderQueue.Enqueue(State,due);
                if(!Save(false)){State=Store.Load();retrySaveAt=DateTime.UtcNow.AddMinutes(1);ScheduleReminders();return;}
                int failedActions=0;foreach(Reminder delivered in due)if(delivered.OpenUrlOnDue){string outcome=ReminderActions.ExecuteClaimed(delivered,delegate(string url){Process.Start(new ProcessStartInfo(url){UseShellExecute=true});});var alert=State.PendingAlerts.FirstOrDefault(n=>n.ReminderId==delivered.Id);if(alert!=null)alert.ActionStatus=outcome;if(outcome!=null&&(outcome.StartsWith("Mochi could not")||outcome.StartsWith("Website opening was blocked"))){failedActions++;Log("A scheduled website could not be opened; its reminder remains visible.");}}
                // Action claims were committed above; a failed status write never repeats the navigation.
                if(due.Any(r=>r.OpenUrlOnDue))Save(false);
                alertsHidden=false;string title=due.Count==1?due[0].Title:due.Count.ToString(CultureInfo.InvariantCulture)+" reminders: "+string.Join("; ",due.Select(r=>r.Title).ToArray());if(failedActions>0)title+=" (A scheduled link could not be opened; see Mochi.)";RequestOsNotification(title,false);
            }
            ShowPendingReminder();ScheduleReminders();
        }
        void Log(string text){try{File.AppendAllText(Path.Combine(Store.DirectoryPath,"diagnostics.log"),DateTime.UtcNow.ToString("u",CultureInfo.InvariantCulture)+" "+text+Environment.NewLine);}catch{}}
        void OpenMenu(){
            StopMotion();idleTimer.Stop();art.SetActive(false);if(activePanel!=null){activePanel.Activate();return;}
            CloseReminderDialogue();activePanel=new CompanionPanel(this);ShowInTaskbar=false;activePanel.Closed+=delegate{bool returnFocus=activePanel!=null&&activePanel.ReturnFocusToCat;activePanel=null;if(!quitting)ShowInTaskbar=true;art.SetActive(ArtworkCanAnimate);if(returnFocus&&!quitting&&IsVisible)art.Focus();ResetIdle();ShowPendingReminder();};activePanel.Show();
        }
        void ShowDialogSafely(Window dialog){interactionDepth++;if(activePanel!=null)activePanel.Close();CloseReminderDialogue();idleTimer.Stop();StopMotion();art.SetActive(false);ShowInTaskbar=false;try{dialog.ShowDialog();}finally{interactionDepth=Math.Max(0,interactionDepth-1);if(!quitting)ShowInTaskbar=true;art.SetActive(ArtworkCanAnimate);ResetIdle();ShowPendingReminder();}}
        public void AddReminder(){ShowDialogSafely(new AddReminderWindow(this));}
        public void OpenMedia(){ShowDialogSafely(new MediaWindow(this));}
        public void OpenGoogleWebSetup(){ShowDialogSafely(new GoogleWebSetupWindow(this));}
        public void OpenReminders(){ShowDialogSafely(new ReminderListWindow(this));}
        public void OpenSettings(){ShowDialogSafely(new SettingsWindow(this,hotkeyRegistered));}
        void OpenCommand(){ShowDialogSafely(new CommandWindow(this));}
        public string ExecuteCommand(string input){
            CommandResult result=Commands.Parse(input,State,DateTime.UtcNow);
            if(result.GoogleSetup){OpenGoogleConnections();return result.Message;}
            if(result.GoogleWorkflow!=null){var review=new GoogleWorkflowReviewWindow(this,result.GoogleWorkflow);ShowDialogSafely(review);return review.Opened?"Google web page opened for your review. Complete it there; Mochi sent or saved nothing.":"Google web action cancelled.";}
            if(result.MediaAction!=null){ShowDialogSafely(new MediaWindow(this,result.MediaAction));return result.Message;}
            if(result.Reminder!=null){if(State.Reminders.Count>=1000)return "Delete old reminders before adding more (limit 1,000).";State.Reminders.Add(result.Reminder);if(!Save(true)){State.Reminders.Remove(result.Reminder);return "The reminder could not be saved.";}ScheduleReminders();AnimatePose("happy",1.8);}
            if(result.Url!=null){if(result.Url==lastNavigationUrl&&(DateTime.UtcNow-lastNavigation).TotalSeconds<2)return "That website was just opened.";try{Process.Start(new ProcessStartInfo(result.Url){UseShellExecute=true});lastNavigationUrl=result.Url;lastNavigation=DateTime.UtcNow;}catch{return "Windows could not open your default browser. Check your HTTP/HTTPS app association.";}}
            return result.Message;
        }
        public bool AddLocalReminder(Reminder reminder){if(State.Reminders.Count>=1000){MessageBox.Show(this,"Mochi supports up to 1,000 saved reminders. Delete old ones first.","Mochi");return false;}State.Reminders.Add(reminder);if(!Save(true)){State.Reminders.Remove(reminder);return false;}ScheduleReminders();return true;}
    }
    public class MochiDialog : Window {
        protected readonly StackPanel Panel=new StackPanel{Margin=new Thickness(20)};
        protected readonly StackPanel FooterButtons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};
        public MochiDialog(CompanionWindow owner,string title,double height){
            Owner=owner;Title=title;Width=470;Height=height;MinWidth=380;MinHeight=260;WindowStartupLocation=WindowStartupLocation.CenterScreen;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;ResizeMode=ResizeMode.NoResize;MochiTheme.Apply(this);
            var shell=new Border{CornerRadius=new CornerRadius(23),Background=MochiTheme.Cream,BorderBrush=MochiTheme.Line,BorderThickness=new Thickness(1),Effect=new System.Windows.Media.Effects.DropShadowEffect{BlurRadius=22,ShadowDepth=5,Opacity=.12}};
            var layout=new Grid();layout.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});layout.RowDefinitions.Add(new RowDefinition());layout.RowDefinitions.Add(new RowDefinition{Height=GridLength.Auto});
            var toolbar=new Grid{Margin=new Thickness(23,16,16,7)};toolbar.ColumnDefinitions.Add(new ColumnDefinition());toolbar.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});var brand=MochiTheme.Text("Mochi / "+title.Replace("Mochi - ",""),11,MochiTheme.Muted,true);brand.VerticalAlignment=VerticalAlignment.Center;toolbar.Children.Add(brand);var close=MochiTheme.Button("Close",Close,false);close.Content=MochiTheme.Icon("close",MochiTheme.Muted,13);close.Width=30;close.Height=30;close.Padding=new Thickness(8);close.BorderThickness=new Thickness(0);close.Background=Brushes.Transparent;Grid.SetColumn(close,1);toolbar.Children.Add(close);toolbar.MouseLeftButtonDown+=delegate(object s,MouseButtonEventArgs e){if(e.OriginalSource==toolbar||e.OriginalSource==brand)try{DragMove();}catch(InvalidOperationException){}};layout.Children.Add(toolbar);
            Panel.Margin=new Thickness(24,8,24,22);var scroll=new ScrollViewer{Content=Panel,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};Grid.SetRow(scroll,1);layout.Children.Add(scroll);var footer=new Border{BorderBrush=MochiTheme.Line,BorderThickness=new Thickness(0,1,0,0),Padding=new Thickness(24,4,18,10),Child=FooterButtons,Visibility=Visibility.Collapsed};Grid.SetRow(footer,2);layout.Children.Add(footer);shell.Child=layout;Content=shell;PreviewKeyDown+=delegate(object s,KeyEventArgs e){if(e.Key==Key.Escape){Close();e.Handled=true;}};
            Loaded+=delegate{footer.Visibility=FooterButtons.Children.Count>0?Visibility.Visible:Visibility.Collapsed;double dpi=1;var source=PresentationSource.FromVisual(this);if(source!=null&&source.CompositionTarget!=null)dpi=source.CompositionTarget.TransformToDevice.M11;Height=Math.Min(Height,Forms.Screen.FromHandle(new WindowInteropHelper(this).Handle).WorkingArea.Height/dpi-28);};
        }
        protected void Heading(string text){Panel.Children.Add(new TextBlock{Text=text,FontSize=22,FontWeight=FontWeights.SemiBold,Margin=new Thickness(0,0,0,12)});}
        protected void Note(string text){Panel.Children.Add(new TextBlock{Text=text,TextWrapping=TextWrapping.Wrap,Foreground=Brushes.DimGray,Margin=new Thickness(0,6,0,10)});}
        protected void Field(string label,FrameworkElement control){Panel.Children.Add(new TextBlock{Text=label,Margin=new Thickness(0,8,0,5),FontWeight=FontWeights.SemiBold});control.Margin=new Thickness(0,0,0,4);System.Windows.Automation.AutomationProperties.SetName(control,label);Panel.Children.Add(control);}
        protected Button Button(string text,Action action){var button=MochiTheme.Button(text,action,text.StartsWith("Save")||text.StartsWith("Run"));button.Margin=new Thickness(0,8,7,4);button.HorizontalAlignment=HorizontalAlignment.Left;if(text=="Delete")button.Foreground=MochiTheme.Danger;return button;}
        protected CheckBox Check(string text,bool value){var check=new CheckBox{Content=text,IsChecked=value,Margin=new Thickness(0,7,0,7)};System.Windows.Automation.AutomationProperties.SetName(check,text);Panel.Children.Add(check);return check;}
    }
    public sealed class AddReminderWindow : MochiDialog {
        public AddReminderWindow(CompanionWindow owner):base(owner,"Mochi - add reminder",640) {
            Heading("A little reminder");
            var title=new TextBox{MinHeight=28,MaxLength=300};Field("What should I remind you about?",title);
            var mode=new ComboBox{ItemsSource=new[]{"In a few minutes","At a date and time"},SelectedIndex=0,MinHeight=28};Field("When",mode);
            var minutes=new TextBox{Text="10",MinHeight=28};Field("Delay in minutes",minutes);
            var date=new DatePicker{SelectedDate=DateTime.Today,MinHeight=28};Field("Local date",date);
            var time=new TextBox{Text=DateTime.Now.AddMinutes(10).ToString("HH:mm",CultureInfo.InvariantCulture),MinHeight=28};Field("Local time (24-hour HH:mm)",time);
            var repeat=new ComboBox{ItemsSource=new[]{"One time","Every day","Every week"},SelectedIndex=0,MinHeight=28};Field("Repeat",repeat);
            var openUrl=Check("Open a website automatically when due",false);var actionUrl=new TextBox{MaxLength=2048,IsEnabled=false,ToolTip="https://example.com"};Field("Website to open",actionUrl);openUrl.Click+=delegate{actionUrl.IsEnabled=openUrl.IsChecked==true;};Note("When checked, Mochi opens this exact HTTP/HTTPS link once per scheduled occurrence. Snoozing only repeats the notification; it does not reopen the site.");
            Note("Timezone: "+TimeZoneInfo.Local.DisplayName+". Mochi must remain running; the browser can be closed. Windows notification settings still apply.");
            var error=new TextBlock{Foreground=Brushes.Firebrick,TextWrapping=TextWrapping.Wrap};Panel.Children.Add(error);
            FooterButtons.Children.Add(Button("Save reminder",delegate{
                try {
                    DateTime due;
                    if(mode.SelectedIndex==0){int count;if(!int.TryParse(minutes.Text,out count)||count<1||count>525600)throw new ArgumentException("Enter a delay from 1 to 525,600 minutes.");due=DateTime.UtcNow.AddMinutes(count);}
                    else {DateTime clock;if(!date.SelectedDate.HasValue||!DateTime.TryParseExact(time.Text.Trim(),"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out clock))throw new ArgumentException("Choose a date and a time such as 09:30.");DateTime local=date.SelectedDate.Value.Date.AddHours(clock.Hour).AddMinutes(clock.Minute);due=ReminderEngine.LocalToUtc(local,TimeZoneInfo.Local);if(due<=DateTime.UtcNow)throw new ArgumentException("Choose a future date and time.");}
                    string recurrence=repeat.SelectedIndex==1?"daily":repeat.SelectedIndex==2?"weekly":"none";
                    var scheduled=ReminderEngine.Create(title.Text,due,recurrence);ReminderActions.Configure(scheduled,actionUrl.Text,openUrl.IsChecked==true);if(owner.AddLocalReminder(scheduled)){owner.AnimatePose("happy",2);Close();}
                }catch(Exception ex){error.Text=ex is ArgumentException?ex.Message:"This reminder could not be saved. Check the date and local timezone.";}
            }));
            Loaded+=delegate{title.Focus();};
        }
    }
    public sealed class ReminderListWindow : MochiDialog {
        readonly CompanionWindow companion;
        public ReminderListWindow(CompanionWindow owner):base(owner,"Mochi - my reminders",540){companion=owner;Refresh();}
        void Refresh(){Panel.Children.Clear();Heading("Your reminders");Note("Notifications work while this native Mochi process is running, even with every browser closed. Claiming a reminder prevents repeated delivery after a restart.");
            Panel.Children.Add(Button("Add a reminder",delegate{new AddReminderWindow(companion).ShowDialog();Refresh();}));
            Note(companion.NotificationStatus);Panel.Children.Add(Button("Test notification",delegate{companion.TestNotification();}));
            if(companion.PendingReminderCount>0)Panel.Children.Add(Button("Show pending reminder ("+companion.PendingReminderCount+")",delegate{Close();companion.ShowPendingReminder();}));
            if(companion.State.Reminders.Count==0){Note("Nothing scheduled yet. A little room for what matters.");return;}
            foreach(Reminder reminder in companion.State.Reminders.OrderBy(r=>r.Completed).ThenBy(r=>r.DueUtcTicks).ToList()) {
                Reminder r=reminder;var card=new StackPanel{Margin=new Thickness(0,9,0,9)};
                card.Children.Add(new TextBlock{Text=r.Title,TextWrapping=TextWrapping.Wrap,FontWeight=FontWeights.SemiBold});if(r.OpenUrlOnDue)card.Children.Add(new TextBlock{Text="Opens when due: "+r.ActionUrl,TextWrapping=TextWrapping.Wrap,Foreground=MochiTheme.Muted,FontSize=11});
                DateTime local=TimeZoneInfo.ConvertTimeFromUtc(new DateTime(r.DueUtcTicks,DateTimeKind.Utc),TimeZoneInfo.FindSystemTimeZoneById(r.TimeZoneId));
                card.Children.Add(new TextBlock{Text=local.ToString("g",CultureInfo.CurrentCulture)+" - "+r.Recurrence+(r.Completed?" - delivered / done":r.Paused?" - paused":""),Foreground=Brushes.DimGray,TextWrapping=TextWrapping.Wrap,FontSize=12});
                var row=new WrapPanel();row.Children.Add(Button("Snooze 5 min",delegate{
                    if(companion.State.Reminders.Count>=1000){MessageBox.Show(this,"Delete old reminders first (limit 1,000).","Mochi");return;}
                    Reminder snooze=ReminderActions.Snooze(r.Title,r.ActionUrl,DateTime.UtcNow.AddMinutes(5));
                    if(!r.Completed){r.LastClaimUtcTicks=r.DueUtcTicks;if(r.Recurrence=="none")r.Completed=true;else r.DueUtcTicks=ReminderEngine.NextOccurrence(r,Math.Max(DateTime.UtcNow.Ticks,r.DueUtcTicks));}
                    companion.State.Reminders.Add(snooze);companion.Save(true);companion.ScheduleReminders();Refresh();
                }));
                if(!r.Completed)row.Children.Add(Button(r.Paused?"Resume":"Pause",delegate{r.Paused=!r.Paused;companion.Save(true);companion.ScheduleReminders();Refresh();}));
                row.Children.Add(Button(r.GoogleService=="calendar"?"Dismiss local event alert":"Delete",delegate{if(r.GoogleService=="calendar")GoogleNativeIntegration.RememberCalendarClaim(companion.State,r.Id,r.DueUtcTicks);companion.State.Reminders.Remove(r);companion.Save(true);companion.ScheduleReminders();Refresh();}));card.Children.Add(row);Panel.Children.Add(card);
            }
        }
    }
    public sealed class CommandWindow : MochiDialog {
        public CommandWindow(CompanionWindow owner):base(owner,"Mochi - command",300){Heading("What shall we do?");Note("Try: play Mercy by Shawn Mendes\nopen GitHub\nremind me in 10 minutes to join the meeting");var input=new TextBox{MaxLength=3000,MinHeight=30};Field("Command",input);var result=new TextBlock{TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,8,0,0)};Action run=delegate{result.Text=owner.ExecuteCommand(input.Text);};Panel.Children.Add(Button("Run command",run));Panel.Children.Add(result);input.KeyDown+=delegate(object s,KeyEventArgs e){if(e.Key==Key.Enter){run();e.Handled=true;}};Loaded+=delegate{input.Focus();};}
    }
    public sealed class SettingsWindow : MochiDialog {
        public SettingsWindow(CompanionWindow owner,bool hotkeyRegistered):base(owner,"Mochi - settings",680){
            Heading("Make yourself at home");PetSettings s=owner.State.Settings;
            var skin=new SpeciesPicker(s.Skin);Field("Choose your companion",skin);
            Panel.Children.Add(Button("Sprite artists and credits",owner.OpenCredits));
            var frequency=new ComboBox{ItemsSource=CursorBehavior.Frequencies,SelectedItem=s.FollowCursorFrequency};Field("Cursor-follow frequency",frequency);Note("Off also stops cursor ambushes. Sometimes preserves the current idle cadence; Following remains optional.");
            var size=new Slider{Minimum=.65,Maximum=1.6,Value=s.Scale,TickFrequency=.05,IsSnapToTickEnabled=true};Field("Companion size",size);
            var opacity=new Slider{Minimum=.5,Maximum=1,Value=s.Opacity,TickFrequency=.05,IsSnapToTickEnabled=true};Field("Opacity",opacity);
            CheckBox playful=Check("Little playful surprises (at most every 30 seconds)",s.PlayfulActions);
            CheckBox roam=Check("Roam around occasionally",s.Roaming),follow=Check("Sometimes follow my cursor",s.Following),paused=Check("Rest / pause animations",s.Paused),top=Check("Always on top",s.AlwaysOnTop),reminders=Check("Deliver reminder notifications",s.RemindersEnabled),quiet=Check("Quiet hours",s.QuietHours);
            var quietStart=new TextBox{Text=s.QuietStart.ToString(CultureInfo.InvariantCulture),MinHeight=26};Field("Quiet hours start (0-23)",quietStart);
            var quietEnd=new TextBox{Text=s.QuietEnd.ToString(CultureInfo.InvariantCulture),MinHeight=26};Field("Quiet hours end (0-23)",quietEnd);
            Note(hotkeyRegistered?"Ctrl+Alt+M recalls Mochi. You can also use the tray icon.":"Ctrl+Alt+M was already in use or unavailable; Mochi did not take it over. Use the tray icon to recall Mochi.");
            bool startupCurrent=false;try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))startupCurrent=key!=null&&key.GetValue("MochiDesktop")!=null;}catch{}
            CheckBox startup=Check("Start Mochi when I sign in to Windows",startupCurrent);startup.IsEnabled=!owner.CustomDataDirectory;
            if(owner.CustomDataDirectory)Note("Start-at-sign-in changes are disabled for this custom data-directory session.");
            var shortcuts=new TextBox{AcceptsReturn=true,MinHeight=100,Text=string.Join(Environment.NewLine,owner.State.Shortcuts.Select(x=>x.Name+"="+x.Url).ToArray()),VerticalScrollBarVisibility=ScrollBarVisibility.Auto};Field("Website shortcuts (one name=https://address per line)",shortcuts);
            Note("Native reminders and preferences stay local. Optional Google connections use your own Desktop OAuth client and store protected credentials in your Windows profile. Your local data is in "+owner.Store.DirectoryPath+". Quit Mochi before deleting that folder to reset desktop data.");
            var error=new TextBlock{Foreground=Brushes.Firebrick,TextWrapping=TextWrapping.Wrap};Panel.Children.Add(error);
            FooterButtons.Children.Add(Button("Save settings",delegate{
                int start,end;if(!int.TryParse(quietStart.Text,out start)||start<0||start>23||!int.TryParse(quietEnd.Text,out end)||end<0||end>23){error.Text="Quiet hours must be whole hours from 0 to 23.";return;}
                var routes=new List<Shortcut>();
                foreach(string raw in shortcuts.Text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries)) {int equal=raw.IndexOf('=');string url=equal>0?Commands.SafeUrl(raw.Substring(equal+1).Trim()):null;string name=equal>0?raw.Substring(0,equal).Trim().ToLowerInvariant():"";if(url==null||name.Length<1||name.Length>40||routes.Any(x=>x.Name==name)||routes.Count>=50){error.Text="Use up to 50 unique shortcut names and full HTTP/HTTPS addresses.";return;}routes.Add(new Shortcut{Name=name,Url=url});}
                if(!owner.CustomDataDirectory&&startup.IsChecked==true!=startupCurrent){try{using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){if(startup.IsChecked==true)key.SetValue("MochiDesktop","\""+Assembly.GetExecutingAssembly().Location+"\"");else key.DeleteValue("MochiDesktop",false);}}catch{error.Text="Windows could not change start-at-sign-in. Other settings have not been saved.";return;}}
                s.Skin=skin.SelectedSpecies;s.FollowCursorFrequency=(string)frequency.SelectedItem;s.Scale=size.Value;s.Opacity=opacity.Value;s.Roaming=roam.IsChecked==true;s.PlayfulActions=playful.IsChecked==true;s.Following=follow.IsChecked==true;s.Paused=paused.IsChecked==true;s.AlwaysOnTop=top.IsChecked==true;s.RemindersEnabled=reminders.IsChecked==true;s.QuietHours=quiet.IsChecked==true;s.QuietStart=start;s.QuietEnd=end;owner.State.Shortcuts=routes;
                if(owner.Save(true)){owner.ApplySettings();Close();}
            }));
        }
    }
    [DataContract] public sealed class NativeTestResult { [DataMember]public string Name;[DataMember]public bool Passed;[DataMember]public string Error; }
    [DataContract] public sealed class NativeTestReport { [DataMember]public int Passed;[DataMember]public int Failed;[DataMember]public PetPlaybackStats Playback;[DataMember]public List<NativeTestResult> Tests=new List<NativeTestResult>(); }
    public static class NativeTests {
        static void Assert(bool condition,string message){if(!condition)throw new Exception(message);}
        public static int Run(string directory,bool requireAssets){var report=new NativeTestReport();Action<string,Action> test=delegate(string name,Action action){var result=new NativeTestResult{Name=name};try{action();result.Passed=true;report.Passed++;}catch(Exception e){result.Error=e.Message;report.Failed++;}report.Tests.Add(result);};
            var now=new DateTime(2026,10,25,10,0,0,DateTimeKind.Utc);
            test("HTTPS accepted",delegate{Assert(Commands.SafeUrl("https://example.com/path?q=cat")!=null,"HTTPS rejected");});
            test("HTTP accepted",delegate{Assert(Commands.SafeUrl("http://localhost:8000/")!=null,"HTTP rejected");});
            foreach(string unsafeUrl in new[]{"javascript:alert(1)","file:///C:/Windows/System32/calc.exe","data:text/html,hello","ftp://example.com","https://user:password@example.com","https://example.com\\@evil.example","https://example.com/\nother","not-a-url"}){string value=unsafeUrl;test("Reject "+value.Replace("\n","newline"),delegate{Assert(Commands.SafeUrl(value)==null,"Unsafe URL accepted");});}
            test("YouTube search escapes query",delegate{var r=Commands.Parse("play Mercy & calm",new StoredState(),now);Assert(r.Url.Contains("%26")&&Commands.SafeUrl(r.Url)!=null,"Query not escaped");});
            test("Known shortcut",delegate{Assert(Commands.Parse("open GitHub",new StoredState(),now).Url=="https://github.com/","Shortcut mismatch");});
            test("Unknown command has no action",delegate{var r=Commands.Parse("run powershell.exe",new StoredState(),now);Assert(r.Url==null&&r.Reminder==null,"Untrusted command executed");});
            test("Relative minutes",delegate{var r=Commands.Parse("remind me in 10 minutes to stretch",new StoredState(),now).Reminder;Assert(r!=null&&r.DueUtcTicks==now.AddMinutes(10).Ticks&&r.Title=="stretch","Wrong reminder");});
            test("Relative seconds",delegate{var r=Commands.Parse("remind me in 8 seconds to breathe",new StoredState(),now).Reminder;Assert(r!=null&&r.DueUtcTicks==now.AddSeconds(8).Ticks,"Wrong delay");});
            test("Zero delay rejected",delegate{Assert(Commands.Parse("remind me in 0 minutes to stretch",new StoredState(),now).Reminder==null,"Zero accepted");});
            test("Huge delay rejected",delegate{Assert(Commands.Parse("remind me in 9999999999 days to stretch",new StoredState(),now).Reminder==null,"Overflow accepted");});
            test("Blank title rejected",delegate{bool rejected=false;try{ReminderEngine.Create(" ",now,"none");}catch{rejected=true;}Assert(rejected,"Blank accepted");});
            test("One-time claim is idempotent",delegate{var s=new StoredState();s.Reminders.Add(ReminderEngine.Create("One",now.AddSeconds(-2),"none"));Assert(ReminderEngine.ClaimDue(s,now).Count==1,"Not delivered");Assert(ReminderEngine.ClaimDue(s,now).Count==0&&s.Reminders[0].Completed,"Duplicate");});
            test("Paused reminders retained",delegate{var s=new StoredState();var r=ReminderEngine.Create("Pause",now.AddHours(-1),"daily");r.Paused=true;s.Reminders.Add(r);Assert(ReminderEngine.ClaimDue(s,now).Count==0&&!r.Completed,"Paused changed");});
            test("Future reminder not delivered",delegate{var s=new StoredState();s.Reminders.Add(ReminderEngine.Create("Future",now.AddDays(1),"none"));Assert(ReminderEngine.ClaimDue(s,now).Count==0,"Premature");});
            test("Missed recurrence catches up once",delegate{var s=new StoredState();s.Reminders.Add(ReminderEngine.Create("Daily",now.AddDays(-15),"daily"));Assert(ReminderEngine.ClaimDue(s,now).Count==1&&s.Reminders[0].DueUtcTicks>now.Ticks,"Bad catch-up");Assert(ReminderEngine.ClaimDue(s,now).Count==0,"Duplicate");});
            test("Weekly seven-day recurrence",delegate{var r=ReminderEngine.Create("Weekly",now.AddDays(-14),"weekly");r.TimeZoneId="UTC";r.Hour=10;r.Minute=0;Assert(ReminderEngine.NextOccurrence(r,now.Ticks)==now.AddDays(7).Ticks,"Weekly drift");});
            test("DST gap first valid minute",delegate{var z=TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");Assert(ReminderEngine.LocalToUtc(new DateTime(2026,3,8,2,30,0),z)==new DateTime(2026,3,8,7,0,0,DateTimeKind.Utc),"Gap policy");});
            test("DST repeated hour earlier occurrence",delegate{var z=TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");Assert(ReminderEngine.LocalToUtc(new DateTime(2026,11,1,1,30,0),z)==new DateTime(2026,11,1,5,30,0,DateTimeKind.Utc),"Repeated hour");});
            test("Recurring intended hour survives DST gap",delegate{var r=new Reminder{Id="dst",Title="DST",DueUtcTicks=new DateTime(2026,3,8,7,0,0,DateTimeKind.Utc).Ticks,Recurrence="daily",TimeZoneId="Eastern Standard Time",Hour=2,Minute=30};Assert(ReminderEngine.NextOccurrence(r,new DateTime(2026,3,8,12,0,0,DateTimeKind.Utc).Ticks)==new DateTime(2026,3,9,6,30,0,DateTimeKind.Utc).Ticks,"Wall hour drift");});
            test("Quiet midnight boundary",delegate{var s=new PetSettings{QuietHours=true,QuietStart=22,QuietEnd=8};Assert(ReminderEngine.IsQuiet(s,new DateTime(2026,1,1,23,0,0))&&ReminderEngine.IsQuiet(s,new DateTime(2026,1,1,7,0,0))&&!ReminderEngine.IsQuiet(s,new DateTime(2026,1,1,12,0,0)),"Quiet wrong");});
            test("Equal quiet endpoints all-day",delegate{Assert(ReminderEngine.IsQuiet(new PetSettings{QuietHours=true,QuietStart=8,QuietEnd=8},DateTime.Now),"Equal boundary");});
            test("Appearance and shortcut normalization",delegate{var s=new StoredState();s.Settings.Scale=100;s.Settings.Opacity=-1;s.Shortcuts.Add(new Shortcut{Name="bad",Url="javascript:alert(1)"});StateStore.Normalize(s);Assert(s.Settings.Scale==1.6&&s.Settings.Opacity==.5&&!s.Shortcuts.Any(x=>x.Name=="bad"),"Normalization");});
            test("Duplicate IDs removed",delegate{var s=new StoredState();var r=ReminderEngine.Create("Duplicate",now,"none");s.Reminders.Add(r);s.Reminders.Add(r);Assert(StateStore.Normalize(s).Reminders.Count==1,"Duplicate stored");});
            test("Durable claim survives atomic save/restart",delegate{var store=new StateStore(Path.Combine(directory,"test-data"));var s=new StoredState();s.Reminders.Add(ReminderEngine.Create("<title> & local",now.AddSeconds(-1),"none"));ReminderEngine.ClaimDue(s,now);store.Save(s);var loaded=store.Load();Assert(loaded.Reminders[0].Title=="<title> & local"&&loaded.Reminders[0].Completed&&ReminderEngine.ClaimDue(loaded,now).Count==0,"Roundtrip/claim failed");Assert(!File.Exists(store.FilePath+".tmp"),"Temp leaked");});
            test("Damaged JSON recovery",delegate{var store=new StateStore(Path.Combine(directory,"recovery-test"));Directory.CreateDirectory(store.DirectoryPath);File.WriteAllText(store.FilePath,"not json");Assert(store.Load().Version==1&&Directory.GetFiles(store.DirectoryPath,"state-recovery-*.json").Length>0,"Recovery failed");});
            AssetTests.Add(test,directory,requireAssets);InteractionTests.Add(test,directory);ActionReminderTests.Add(test,directory);GoogleWebWorkflowTests.Add(test);GoogleNativeIntegrationTests.Add(test,directory);GoogleNativeTests.Add(test,directory);report.Playback=AssetTests.LastPlaybackStats;
            Directory.CreateDirectory(directory);using(var stream=File.Create(Path.Combine(directory,"self-test-results.json")))new DataContractJsonSerializer(typeof(NativeTestReport)).WriteObject(stream,report);return report.Failed==0?0:1;
        }
    }
    public static class Program {
        [STAThread] public static int Main(string[] args) {
            string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Mochi");bool custom=false,selfTest=false,requireAssets=false;int demoSeconds=0,quitAfter=0;
            for(int i=0;i<args.Length;i++){if(args[i]=="--data-dir"&&i+1<args.Length){directory=args[++i];custom=true;}else if(args[i]=="--self-test")selfTest=true;else if(args[i]=="--require-assets")requireAssets=true;else if(args[i]=="--demo-reminder-seconds"&&i+1<args.Length)int.TryParse(args[++i],out demoSeconds);else if(args[i]=="--quit-after-seconds"&&i+1<args.Length)int.TryParse(args[++i],out quitAfter);}
            try {
                directory=Path.GetFullPath(directory);Directory.CreateDirectory(directory);if(selfTest)return NativeTests.Run(directory,requireAssets);Native.SetProcessDPIAware();
                bool created;string mutexName="Local\\MochiDesktop-"+directory.ToUpperInvariant().GetHashCode().ToString("X8",CultureInfo.InvariantCulture);
                using(var mutex=new Mutex(true,mutexName,out created)){
                    if(!created){MessageBox.Show("Mochi is already running for this data folder. Use its tray menu or Ctrl+Alt+M to recall Mochi.","Mochi");return 0;}
                    var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};var cat=new CompanionWindow(new StateStore(directory),custom);app.MainWindow=cat;
                    if(demoSeconds>0&&custom){cat.State.Reminders.Add(ReminderEngine.Create("Native Mochi reminder test - the browser can be closed",DateTime.UtcNow.AddSeconds(Math.Min(300,demoSeconds)),"none"));cat.Save(false);}
                    if(quitAfter>0&&custom){var timer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(Math.Min(3600,quitAfter))};timer.Tick+=delegate{timer.Stop();cat.Quit();};timer.Start();}
                    cat.Show();app.Run();mutex.ReleaseMutex();return 0;
                }
            }catch(Exception error){try{File.WriteAllText(Path.Combine(directory,"last-error.log"),error.ToString());}catch{}MessageBox.Show("Mochi could not start. See last-error.log in its data folder for details.","Mochi",MessageBoxButton.OK,MessageBoxImage.Warning);return 1;}
        }
    }
}

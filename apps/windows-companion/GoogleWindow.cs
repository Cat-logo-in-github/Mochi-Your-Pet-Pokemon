
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
namespace MochiDesktop {
 public sealed class GoogleWindow:MochiDialog {
  readonly CompanionWindow companion;
  readonly TextBox client=new TextBox{MaxLength=250},calendars=new TextBox{MaxLength=5000},senders=new TextBox{MaxLength=10000,MinHeight=58,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap};
  readonly PasswordBox secret=new PasswordBox{MaxLength=2048,Padding=new Thickness(10)};
  readonly ComboBox mode=new ComboBox(),offset=new ComboBox(),cadence=new ComboBox(),allDayHour=new ComboBox();
  readonly CheckBox mute=new CheckBox{Content="Mute Gmail system alerts"},allDay=new CheckBox{Content="Remind me about all-day events"};
  readonly TextBlock calendarStatus=MochiTheme.Text("",13,MochiTheme.Ink,true),calendarDetail=MochiTheme.Text("",11,MochiTheme.Muted,false),mailStatus=MochiTheme.Text("",13,MochiTheme.Ink,true),mailDetail=MochiTheme.Text("",11,MochiTheme.Muted,false),feedback=MochiTheme.Text("",12,MochiTheme.Muted,false),delivery=MochiTheme.Text("",11,MochiTheme.Muted,false);
  readonly StackPanel schedule=new StackPanel();
  readonly List<Button> actions=new List<Button>();
  readonly DispatcherTimer statusTimer=new DispatcherTimer(DispatcherPriority.Background);
  bool busy,closed;
  public GoogleWindow(CompanionWindow owner):base(owner,"Mochi - Google connections",760){
   companion=owner;Width=510;MinWidth=410;
   Panel.Children.Add(MochiTheme.Text("GOOGLE / LOCALLY YOURS",10,MochiTheme.Purple,true));Heading("A little more helpful");
   Note("Calendar reminders and new-mail alerts, even with your browser closed. Sign-in opens Google in your normal browser.");
   Panel.Children.Add(ServiceCard("Calendar",calendarStatus,calendarDetail,"calendar"));
   Panel.Children.Add(ServiceCard("Gmail",mailStatus,mailDetail,"gmail"));
   feedback.Margin=new Thickness(0,6,0,8);Panel.Children.Add(feedback);
   var c=owner.GoogleConfiguration;
   var setup=new StackPanel();
   Label(setup,"Your Desktop OAuth client ID",client);client.Text=c.ClientId;
   Label(setup,"Optional Desktop client secret (stored only on this PC)",secret);secret.Password=c.ClientSecret??"";
   setup.Children.Add(MochiTheme.Text("Use a Desktop app client from your own Google project. The Chrome Extension client ID cannot be reused here. Never put credentials in the project or send a secret in chat.",11,MochiTheme.Muted,false));
   setup.Children.Add(ActionButton("Open Google Cloud clients",delegate{Open("https://console.cloud.google.com/auth/clients");return Task.FromResult(0);}));
   var setupExpander=new Expander{Header="Personal Google setup",IsExpanded=string.IsNullOrWhiteSpace(c.ClientId),Content=setup,Margin=new Thickness(0,5,0,12)};Panel.Children.Add(setupExpander);
   var preferences=new StackPanel();
   mode.ItemsSource=new[]{"All new inbox mail","Important label or my sender list","Only my sender list"};mode.SelectedIndex=c.GmailMode=="senders"?2:c.GmailMode=="important"?1:0;Label(preferences,"Gmail notification filter",mode);
   Label(preferences,"Important sender email addresses",senders);senders.Text=string.Join(", ",c.GmailSenders);senders.ToolTip="Exact email addresses, separated by commas or lines. Used only in the selected sender filters.";
   mute.IsChecked=c.GmailMuted;mute.Margin=new Thickness(0,8,0,8);AutomationProperties.SetName(mute,"Mute Gmail system alerts");preferences.Children.Add(mute);
   calendars.Text=string.Join(", ",c.CalendarIds);Label(preferences,"Calendar IDs (primary by default)",calendars);
   offset.ItemsSource=new[]{0,5,10,15,30,60};offset.SelectedItem=c.OffsetMinutes;Label(preferences,"Minutes before a timed event",offset);
   allDay.IsChecked=c.AllDayReminders;allDay.Margin=new Thickness(0,10,0,7);AutomationProperties.SetName(allDay,"Remind me about all-day events");preferences.Children.Add(allDay);
   allDayHour.ItemsSource=Enumerable.Range(0,24).Select(x=>x.ToString("00",CultureInfo.InvariantCulture)+":00").ToList();allDayHour.SelectedIndex=c.AllDayHour;Label(preferences,"All-day reminder time (this PC's timezone)",allDayHour);
   cadence.ItemsSource=new[]{1,5,15};cadence.SelectedItem=c.CheckMinutes;Label(preferences,"Check Google every (minutes)",cadence);
   preferences.Children.Add(ActionButton("Save notification preferences",delegate{SaveFields();feedback.Text="Saved on this PC. Check now to apply your changes.";return Task.FromResult(0);}));
   Panel.Children.Add(new Expander{Header="Notification preferences",Content=preferences,Margin=new Thickness(0,0,0,12)});
   var saved=new StackPanel();saved.Children.Add(MochiTheme.Text("SAVED ON THIS PC",10,MochiTheme.Purple,true));saved.Children.Add(delivery);saved.Children.Add(schedule);Panel.Children.Add(MochiTheme.Card(saved));
   var tools=new WrapPanel{Margin=new Thickness(0,12,0,5)};
   tools.Children.Add(ActionButton("Check now",async delegate{await companion.SyncGoogle(true);}));
   tools.Children.Add(ActionButton("Test notification",delegate{companion.TestNotification();return Task.FromResult(0);}));Panel.Children.Add(tools);
   Note("Google data is protected for your Windows user outside this project. Messages and event titles are not downloaded. Scheduled Calendar reminders keep working offline while Mochi and Windows are running; new mail needs an internet connection.");
   Panel.Children.Add(ActionButton("Review Google account access",delegate{Open("https://myaccount.google.com/connections");return Task.FromResult(0);}));
   FooterButtons.Children.Add(Button("All reminders",delegate{Close();companion.OpenReminders();}));
   FooterButtons.Children.Add(Button("Done",Close));
   statusTimer.Interval=TimeSpan.FromSeconds(2);statusTimer.Tick+=delegate{RefreshStatus();};Loaded+=delegate{RefreshStatus();statusTimer.Start();};Closed+=delegate{closed=true;statusTimer.Stop();secret.Clear();};
  }
  FrameworkElement ServiceCard(string name,TextBlock status,TextBlock detail,string service){
   var contents=new StackPanel();contents.Children.Add(MochiTheme.Text("GOOGLE "+name.ToUpperInvariant(),10,MochiTheme.Purple,true));status.Margin=new Thickness(0,5,0,5);contents.Children.Add(status);contents.Children.Add(detail);
   var row=new WrapPanel{Margin=new Thickness(0,8,0,0)};row.Children.Add(ActionButton("Connect "+name,async delegate{SaveFields();feedback.Text="Finish sign-in and read-only consent in Google, then return here.";await companion.ConnectGoogle(service);}));
   row.Children.Add(ActionButton("Disconnect "+name,async delegate{await companion.DisconnectGoogle(service);feedback.Text="Disconnected locally. Revoke Google-side project access separately if desired.";}));
   contents.Children.Add(row);var card=MochiTheme.Card(contents);card.Margin=new Thickness(0,0,0,10);return card;
  }
  static void Label(StackPanel into,string caption,FrameworkElement control){var text=MochiTheme.Text(caption,12,MochiTheme.Ink,true);text.Margin=new Thickness(0,10,0,5);into.Children.Add(text);control.Margin=new Thickness(0,0,0,5);AutomationProperties.SetName(control,caption);into.Children.Add(control);}
  Button ActionButton(string caption,Func<Task> action){
   var button=MochiTheme.Button(caption,async delegate{if(busy||companion.GoogleBusy)return;busy=true;RefreshStatus();try{await action();}catch(Exception error){feedback.Text=error is NativeGoogleException||error is ArgumentException||error is InvalidOperationException?error.Message:"Mochi could not complete that Google action. Check your setup and try again.";feedback.Foreground=MochiTheme.Danger;}finally{busy=false;if(!closed)RefreshStatus();}},caption.StartsWith("Connect",StringComparison.Ordinal));
   button.Margin=new Thickness(0,3,7,3);actions.Add(button);return button;
  }
  void SaveFields(){var c=new NativeGoogleConfig{ClientId=client.Text.Trim(),ClientSecret=secret.Password,CalendarIds=Split(calendars.Text),GmailSenders=Split(senders.Text),GmailMode=mode.SelectedIndex==2?"senders":mode.SelectedIndex==1?"important":"all",GmailMuted=mute.IsChecked==true,OffsetMinutes=offset.SelectedItem is int?(int)offset.SelectedItem:10,CheckMinutes=cadence.SelectedItem is int?(int)cadence.SelectedItem:1,AllDayReminders=allDay.IsChecked==true,AllDayHour=Math.Max(0,allDayHour.SelectedIndex)};companion.SaveGoogleConfiguration(c);}
  static List<string> Split(string value){return (value??"").Split(new[]{',',';','\r','\n'},StringSplitOptions.RemoveEmptyEntries).Select(x=>x.Trim()).Where(x=>x.Length>0).ToList();}
  static string Time(long ticks){return ticks>0&&ticks<=DateTime.MaxValue.Ticks?new DateTime(ticks,DateTimeKind.Utc).ToLocalTime().ToString("ddd HH:mm",CultureInfo.CurrentCulture):"not yet";}
  void RefreshStatus(){
   var s=companion.GoogleStatus;bool working=busy||companion.GoogleBusy;foreach(var b in actions)b.IsEnabled=!working;
   calendarStatus.Text=s.Calendar.Connected?"Connected / saved reminders":"Not connected";mailStatus.Text=s.Gmail.Connected?"Connected / "+(s.GmailMode=="all"?"all new inbox mail":s.GmailMode=="senders"?"sender list":"important mail"):"Not connected";
   calendarStatus.Foreground=s.Calendar.Connected?MochiTheme.Purple:MochiTheme.Muted;mailStatus.Foreground=s.Gmail.Connected?MochiTheme.Purple:MochiTheme.Muted;
   calendarDetail.Text=(s.Calendar.Error??"")+(string.IsNullOrEmpty(s.Calendar.Error)?"":"\n")+s.Calendar.Summary+"\nLast successful check: "+Time(s.Calendar.LastSyncUtcTicks)+" / next: "+Time(s.Calendar.NextCheckUtcTicks);
   mailDetail.Text=(s.Gmail.Error??"")+(string.IsNullOrEmpty(s.Gmail.Error)?"":"\n")+s.Gmail.Summary+"\nLast successful check: "+Time(s.Gmail.LastSyncUtcTicks)+" / next: "+Time(s.Gmail.NextCheckUtcTicks);
   delivery.Text=companion.GoogleScheduledLocalCount+" Calendar reminders scheduled / rolling window to "+Time(s.HorizonEndUtcTicks)+".\n"+companion.GoogleHostMessage;
   schedule.Children.Clear();foreach(var r in companion.State.Reminders.Where(x=>x.GoogleService=="calendar"&&!x.Completed&&!x.Paused).OrderBy(x=>x.DueUtcTicks).Take(5)){var line=MochiTheme.Text((r.GoogleAllDay?"All-day / ":"Event / ")+Time(r.GoogleStartUtcTicks)+"\nReminder: "+Time(r.DueUtcTicks),11,MochiTheme.Ink,false);line.Margin=new Thickness(0,8,0,0);schedule.Children.Add(line);}
   if(working&&string.IsNullOrWhiteSpace(feedback.Text))feedback.Text="Checking Google. Sign-in can take a moment.";
  }
  void Open(string url){try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch{feedback.Text="Windows could not open your browser.";}}
 }
}

using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using Forms=System.Windows.Forms;
using Drawing=System.Drawing;
namespace MochiDesktop {
    [DataContract] public sealed class ReminderNotice {
        [DataMember] public string ReminderId;
        [DataMember] public string Title;
        [DataMember] public long DueUtcTicks;
        [DataMember] public string ActionUrl;
        [DataMember] public string ActionStatus;
    }
    public static class ReminderQueue {
        public static void Enqueue(StoredState state,IEnumerable<Reminder> reminders){foreach(Reminder r in reminders){var existing=state.PendingAlerts.FirstOrDefault(n=>n.ReminderId==r.Id);if(existing==null)state.PendingAlerts.Add(new ReminderNotice{ReminderId=r.Id,Title=r.Title,DueUtcTicks=r.DueUtcTicks,ActionUrl=Commands.SafeUrl(r.ActionUrl),ActionStatus=r.OpenUrlOnDue?"Website opening is claimed once for this occurrence.":"Saved link: open it when you are ready."});else {existing.Title=r.Title;existing.DueUtcTicks=r.DueUtcTicks;existing.ActionUrl=Commands.SafeUrl(r.ActionUrl);existing.ActionStatus=r.OpenUrlOnDue?"Website opening is claimed once for this occurrence.":"Saved link: open it when you are ready.";}}}
        public static void Normalize(StoredState state){var ids=new HashSet<string>(state.Reminders.Select(r=>r.Id));state.PendingAlerts=(state.PendingAlerts??new List<ReminderNotice>()).Where(n=>n!=null&&ids.Contains(n.ReminderId)&&!string.IsNullOrWhiteSpace(n.Title)&&n.Title.Length<=300&&n.DueUtcTicks>=DateTime.MinValue.Ticks&&n.DueUtcTicks<=DateTime.MaxValue.Ticks).GroupBy(n=>n.ReminderId).Select(g=>g.First()).Take(1000).ToList();}
    }
    public static class CursorBehavior {
        public static readonly string[] Frequencies={"off","rarely","sometimes","often"};
        public static string Normalize(string value){return Frequencies.Contains(value)?value:"sometimes";}
        public static double Chance(string frequency){switch(frequency){case "off":return 0;case "rarely":return .15;case "often":return .7;default:return .35;}}
        public static double Cooldown(string frequency){switch(frequency){case "off":return double.PositiveInfinity;case "rarely":return 90;case "often":return 15;default:return 0;}}
        public static bool Allows(string frequency,DateTime last,DateTime now){return frequency!="off"&&(now-last).TotalSeconds>=Cooldown(frequency);}
    }
    public sealed class ReminderDialogue : Window {
        readonly Func<Drawing.Rectangle> petBounds;readonly TextBlock feedback;
        public ReminderDialogue(ReminderNotice notice,bool test,int count,Func<bool> dismiss,Func<string> snooze,Func<Drawing.Rectangle> bounds){
            petBounds=bounds;Title=test?"Mochi - test notification":"Mochi - reminder";Width=310;SizeToContent=SizeToContent.Height;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;ResizeMode=ResizeMode.NoResize;ShowInTaskbar=false;ShowActivated=false;Topmost=true;UseLayoutRounding=true;SnapsToDevicePixels=true;FontFamily=new FontFamily("Consolas");FontSize=14;Foreground=MochiTheme.ColorBrush("#3B2B26");TextOptions.SetTextFormattingMode(this,TextFormattingMode.Display);MochiTheme.Apply(this);FontFamily=new FontFamily("Consolas");
            var frame=new Border{Background=MochiTheme.ColorBrush("#FFF8E5"),BorderBrush=MochiTheme.ColorBrush("#4B342C"),BorderThickness=new Thickness(3),Padding=new Thickness(14),Effect=new DropShadowEffect{BlurRadius=0,ShadowDepth=4,Opacity=1,Color=Color.FromRgb(117,88,74)}};
            var content=new StackPanel();content.Children.Add(new TextBlock{Text=test?"MOCHI / TEST NOTIFICATION":"MOCHI / REMINDER"+(count>1?"  1 OF "+count.ToString(CultureInfo.InvariantCulture):""),FontSize=11,FontWeight=FontWeights.Bold,Foreground=MochiTheme.ColorBrush("#805B3A"),Margin=new Thickness(0,0,0,8)});
            var title=new TextBlock{Text=notice.Title,TextWrapping=TextWrapping.Wrap,FontSize=16,FontWeight=FontWeights.SemiBold,LineHeight=22};AutomationProperties.SetName(title,"Reminder: "+notice.Title);content.Children.Add(new ScrollViewer{Content=title,MaxHeight=140,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
            content.Children.Add(new TextBlock{Text=test?"This preview stays until dismissed. Windows may hide its separate notification.":"Due "+new DateTime(notice.DueUtcTicks,DateTimeKind.Utc).ToLocalTime().ToString("ddd HH:mm",CultureInfo.CurrentCulture),FontSize=11,TextWrapping=TextWrapping.Wrap,Foreground=MochiTheme.ColorBrush("#765D4B"),Margin=new Thickness(0,8,0,8)});
            if(!string.IsNullOrEmpty(notice.ActionUrl))content.Children.Add(new TextBlock{Text=(notice.ActionStatus??"Website action was claimed once; check your browser.")+"\n"+notice.ActionUrl,TextWrapping=TextWrapping.Wrap,FontSize=11,MaxHeight=100,Foreground=MochiTheme.ColorBrush("#765D4B"),Margin=new Thickness(0,3,0,7)});
            feedback=new TextBlock{TextWrapping=TextWrapping.Wrap,FontSize=11,Foreground=MochiTheme.Danger};content.Children.Add(feedback);
            if(Commands.SafeUrl(notice.ActionUrl)!=null){var open=PixelButton("Open linked page",delegate{try{Process.Start(new ProcessStartInfo(Commands.SafeUrl(notice.ActionUrl)){UseShellExecute=true});feedback.Text="Link sent to your default browser.";}catch{feedback.Text="Windows could not open your browser. The saved link is shown above.";}});open.Margin=new Thickness(0,4,0,8);content.Children.Add(open);}
            var row=new System.Windows.Controls.Primitives.UniformGrid{Columns=2,Margin=new Thickness(0,5,0,0)};var dismissButton=PixelButton("Dismiss",delegate{if(dismiss())Close();else feedback.Text="Mochi could not save dismissal. Please try again.";});dismissButton.Margin=new Thickness(0,0,4,0);row.Children.Add(dismissButton);var snoozeButton=PixelButton("Snooze 5m",delegate{string error=snooze();if(error==null)Close();else feedback.Text=error;});snoozeButton.IsEnabled=!test;snoozeButton.Margin=new Thickness(4,0,0,0);row.Children.Add(snoozeButton);content.Children.Add(row);frame.Child=content;Content=frame;Loaded+=delegate{Anchor();};PreviewKeyDown+=delegate(object s,KeyEventArgs e){if(e.Key==Key.Escape){if(dismiss())Close();e.Handled=true;}};
        }
        static Button PixelButton(string text,Action action){var b=new Button{Content=text,FontFamily=new FontFamily("Consolas"),FontWeight=FontWeights.Bold,FontSize=12,Padding=new Thickness(8),Background=MochiTheme.ColorBrush("#EAD1A4"),Foreground=MochiTheme.ColorBrush("#3B2B26"),BorderBrush=MochiTheme.ColorBrush("#4B342C"),BorderThickness=new Thickness(2)};AutomationProperties.SetName(b,text);var t=new ControlTemplate(typeof(Button));var border=new FrameworkElementFactory(typeof(Border));border.SetValue(Border.BackgroundProperty,new System.Windows.TemplateBindingExtension(Control.BackgroundProperty));border.SetValue(Border.BorderBrushProperty,new System.Windows.TemplateBindingExtension(Control.BorderBrushProperty));border.SetValue(Border.BorderThicknessProperty,new System.Windows.TemplateBindingExtension(Control.BorderThicknessProperty));border.SetValue(Border.PaddingProperty,new System.Windows.TemplateBindingExtension(Control.PaddingProperty));var p=new FrameworkElementFactory(typeof(ContentPresenter));p.SetValue(FrameworkElement.HorizontalAlignmentProperty,HorizontalAlignment.Center);border.AppendChild(p);t.VisualTree=border;b.Template=t;b.Click+=delegate{action();};return b;}
        public void Anchor(){var pet=petBounds();var area=Forms.Screen.FromRectangle(pet).WorkingArea;double dpi=1;var source=PresentationSource.FromVisual(this);if(source!=null&&source.CompositionTarget!=null)dpi=source.CompositionTarget.TransformToDevice.M11;MaxHeight=Math.Max(180,area.Height/dpi-24);double x=pet.Left/dpi+(pet.Width/dpi-Width)/2,y=pet.Top/dpi-ActualHeight-12;if(y<area.Top/dpi+10)y=pet.Bottom/dpi+12;Left=Math.Max(area.Left/dpi+10,Math.Min(area.Right/dpi-Width-10,x));Top=Math.Max(area.Top/dpi+10,Math.Min(area.Bottom/dpi-ActualHeight-10,y));}
    }
}

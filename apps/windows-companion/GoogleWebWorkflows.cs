// Web-only Google workflow previews. No OAuth tokens, project reads, API writes, or outbound send operation.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Net.Mail;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
namespace MochiDesktop {
 public sealed class GoogleWebPlan {public string Service,Action,Title,Description,Url;}
 public static class GoogleWebWorkflows {
  static string Encode(string value){return Uri.EscapeDataString(value??"");}
  public static bool IsTrusted(string value){Uri u;return Commands.SafeUrl(value)!=null&&Uri.TryCreate(value,UriKind.Absolute,out u)&&u.Scheme=="https"&&u.IsDefaultPort&&(u.Host=="mail.google.com"&&(u.AbsolutePath=="/mail"||u.AbsolutePath=="/mail/"||u.AbsolutePath=="/mail/u/0/")||u.Host=="calendar.google.com"&&(u.AbsolutePath=="/"||u.AbsolutePath=="/calendar/r/eventedit"||Regex.IsMatch(u.AbsolutePath,@"^/calendar/u/0/r/(?:day|week)/\d{4}/\d{1,2}/\d{1,2}$")));}
  static CommandResult Plan(string service,string action,string title,string description,string url){if(!IsTrusted(url))return new CommandResult{Message="Keep this web draft short, or finish it directly in Google."};return new CommandResult{GoogleWorkflow=new GoogleWebPlan{Service=service,Action=action,Title=title,Description=description,Url=url},Message="Review the Google web action before opening it. Nothing is sent or saved by Mochi."};}
  static CommandResult Search(string query){if(string.IsNullOrWhiteSpace(query)||query.Length>400)return new CommandResult{Message="Use a Gmail search up to 400 characters."};query=Regex.Replace(query,@"^unread from\s+","is:unread from:",RegexOptions.IgnoreCase);query=Regex.Replace(query,@"^from\s+","from:",RegexOptions.IgnoreCase);return Plan("gmail","search-mail","Search Gmail","Search: "+query+"\nRead the results in your browser.","https://mail.google.com/mail/u/0/#search/"+Encode(query));}
  public static CommandResult TryParse(string input,DateTime nowUtc){
   if((input??"").Length>3000||(input??"").Any(char.IsControl))return new CommandResult{Message="Use a short, single-line Google command."};
   string text=Regex.Replace(input??"",@"^(?:(?:please|can you|could you)\s+)+","",RegexOptions.IgnoreCase).Trim();
   if(Regex.IsMatch(text,@"^(?:(?:connect|set up|setup|configure|link)(?: my)? (?:google(?: account| connection| connections)?|gmail|calendar|google calendar)|google (?:setup|connections?))[.!?]?$",RegexOptions.IgnoreCase))return new CommandResult{GoogleSetup=true,Message="Google connection setup opens in Mochi. Native web shortcuts use your browser account."};
   if(Regex.IsMatch(text,@"^(?:show|check|open|view|find|list)(?: me)?(?: my)? unread (?:e-?mails?|mail|messages?|gmail)(?: in gmail)?[.!?]?$",RegexOptions.IgnoreCase))return Search("is:unread");
   if(Regex.IsMatch(text,@"^(?:check|open|show|view|read)(?: my)? (?:inbox|e-?mails?|mail|gmail)[.!?]?$",RegexOptions.IgnoreCase))return Plan("gmail","search-mail","Open Gmail","Open your Gmail inbox in your browser. Mochi does not read your messages.","https://mail.google.com/mail/u/0/#inbox");
   Match search=Regex.Match(text,@"^(?:search|find|show|look for)(?: my| me)? (?:e-?mails?|mail|messages?|gmail)(?: (?:for|about|matching|containing))? (.+)$",RegexOptions.IgnoreCase);if(search.Success)return Search(search.Groups[1].Value);
   search=Regex.Match(text,@"^(?:gmail|e-?mail|mail) (?:search|find)(?: for)? (.+)$",RegexOptions.IgnoreCase);if(search.Success)return Search(search.Groups[1].Value);
   Match compose=Regex.Match(text,@"^(?:(?:draft|compose|write|send)(?: an?| a)? (?:e-?mail|mail|gmail|message)|email)(?: to)?(?: (.+))?$",RegexOptions.IgnoreCase);
   if(compose.Success){
    string rest=compose.Groups[1].Value;if(string.IsNullOrWhiteSpace(rest))return Plan("gmail","compose-mail","Open Gmail compose","Open a blank compose page. Review and send in Gmail; Mochi sends nothing.","https://mail.google.com/mail/?view=cm&fs=1");
    Match parts=Regex.Match(rest,@"^(\S+?)(?: (?:subject|about):?\s+(.*?))?(?: (?:body|saying|message):?\s+(.+))?$",RegexOptions.IgnoreCase);if(!parts.Success)return new CommandResult{Message="Try: draft email to name@example.com subject Lunch body Are you free?"};
    string recipient=parts.Groups[1].Value,subject=parts.Groups[2].Value,body=parts.Groups[3].Value;
    try{var address=new MailAddress(recipient);if(!string.Equals(address.Address,recipient,StringComparison.OrdinalIgnoreCase)||!string.IsNullOrEmpty(address.DisplayName)||recipient.Length>254)throw new FormatException();}catch{return new CommandResult{Message="Choose one complete email address. Mochi can open a draft, and you send it in Gmail."};}
    if(subject.Length>200||body.Length>1500)return new CommandResult{Message="Keep the draft short, then continue writing in Gmail."};
    return Plan("gmail","compose-mail","Review a Gmail draft","To: "+recipient+"\nSubject: "+(subject.Length==0?"(blank)":subject)+"\nBody: "+(body.Length==0?"(blank)":body)+"\n\nYou review and send in Gmail.","https://mail.google.com/mail/?view=cm&fs=1&to="+Encode(recipient)+"&su="+Encode(subject)+"&body="+Encode(body));
   }
   DateTime local=TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(nowUtc,DateTimeKind.Utc),TimeZoneInfo.Local);
   Match agenda=Regex.Match(text,@"^(?:(?:show|open|check|view|list)(?: me)?(?: my)?(?: google)? (?:calendar|agenda|schedule|events)|(?:what is|what's) on my (?:calendar|schedule)|(?:my )?(?:google )?(?:calendar|agenda))(?: (today|tomorrow|this week|week))?[.!?]?$",RegexOptions.IgnoreCase);
   if(agenda.Success){string period=agenda.Groups[1].Value.ToLowerInvariant();DateTime date=period=="tomorrow"?local.Date.AddDays(1):local.Date;string mode=period.Contains("week")?"week":"day";return Plan("calendar","open-agenda","Open Google Calendar",period.Length==0?"Open Calendar in your browser. Mochi does not read native calendar events.":"View "+period+" in Google Calendar. Sign in and choose your calendar there.",period.Length==0?"https://calendar.google.com/":"https://calendar.google.com/calendar/u/0/r/"+mode+"/"+date.ToString("yyyy/M/d",CultureInfo.InvariantCulture));}
   Match ev=Regex.Match(text,@"^(?:add|create|schedule|draft)(?: an?| a)?(?: calendar)? (?:event|meeting) (.+?) (today|tomorrow|\d{4}-\d{2}-\d{2}) at\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?: for\s*(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h))?[.!?]?$",RegexOptions.IgnoreCase);
   if(ev.Success){string title=ev.Groups[1].Value.Trim('"');int hour=int.Parse(ev.Groups[3].Value,CultureInfo.InvariantCulture),minute=ev.Groups[4].Success?int.Parse(ev.Groups[4].Value,CultureInfo.InvariantCulture):0;string meridiem=ev.Groups[5].Value.ToLowerInvariant();
    if(title.Length>200||minute>59||meridiem.Length==0&&(hour>23||!ev.Groups[4].Success&&hour<=12)||meridiem.Length>0&&(hour<1||hour>12))return new CommandResult{Message="Choose a short title and an explicit time such as 3pm or 15:00."};
    if(meridiem.Length>0)hour=hour%12+(meridiem=="pm"?12:0);DateTime day;string dayText=ev.Groups[2].Value.ToLowerInvariant();if(dayText=="today")day=local.Date;else if(dayText=="tomorrow")day=local.Date.AddDays(1);else if(!DateTime.TryParseExact(dayText,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out day))return new CommandResult{Message="Choose today, tomorrow, or a date like 2026-11-03."};
    int duration=60;if(ev.Groups[6].Success){if(!int.TryParse(ev.Groups[6].Value,out duration)||duration<1||duration>1440)return new CommandResult{Message="Choose an event duration from 1 to 1440 minutes."};if(ev.Groups[7].Value.ToLowerInvariant().StartsWith("h"))duration*=60;}if(duration>1440)return new CommandResult{Message="Choose an event up to 24 hours."};
    DateTime start,end;try{start=ReminderEngine.LocalToUtc(day.AddHours(hour).AddMinutes(minute),TimeZoneInfo.Local);end=start.AddMinutes(duration);}catch{return new CommandResult{Message="Choose an event date within the supported calendar range."};}
    string dates=start.ToString("yyyyMMdd'T'HHmmss'Z'",CultureInfo.InvariantCulture)+"/"+end.ToString("yyyyMMdd'T'HHmmss'Z'",CultureInfo.InvariantCulture);
    return Plan("calendar","create-event","Review a calendar event","Title: "+title+"\nWhen: "+day.AddHours(hour).AddMinutes(minute).ToString("f",CultureInfo.CurrentCulture)+"\nTimezone: "+TimeZoneInfo.Local.DisplayName+"\nDuration: "+duration+" minutes\n\nReview and save in Google Calendar.","https://calendar.google.com/calendar/r/eventedit?action=TEMPLATE&text="+Encode(title)+"&dates="+Encode(dates));
   }
   if(Regex.IsMatch(text,@"^(?:add|create|schedule|draft)(?: an?| a)?(?: calendar)? (?:event|meeting)\b",RegexOptions.IgnoreCase))return new CommandResult{Message="Try: schedule event Team catchup tomorrow at 3pm for 30 min. Mochi opens a reviewable Google Calendar form."};
   return null;
  }
 }
 public sealed class GoogleWorkflowReviewWindow : MochiDialog {
  public bool Opened {get;private set;}
  public GoogleWorkflowReviewWindow(CompanionWindow owner,GoogleWebPlan plan):base(owner,"Mochi - review Google web action",500){Heading(plan.Title);Note("Google web shortcut. Review this action in your browser; monitoring access does not send mail or save events.");var preview=new TextBox{Text=plan.Description,IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=150,MaxHeight=250,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};Field("Review what will open",preview);Note("Google receives the search or draft text shown here when you open it. Review and complete the action in Google. No message is sent and no event is saved by Mochi.");var error=new TextBlock{TextWrapping=TextWrapping.Wrap,Foreground=MochiTheme.Danger};Panel.Children.Add(error);FooterButtons.Children.Add(Button("Open in Google",delegate{if(!GoogleWebWorkflows.IsTrusted(plan.Url)){error.Text="This action is not a supported Google web link.";return;}try{Process.Start(new ProcessStartInfo(plan.Url){UseShellExecute=true});Opened=true;Close();}catch{error.Text="Windows could not open the default browser. Check the browser association and try again.";}}));FooterButtons.Children.Add(Button("Cancel",Close));}
 }
 public sealed class GoogleWebSetupWindow : MochiDialog {
  public GoogleWebSetupWindow(CompanionWindow owner):base(owner,"Mochi - Google web shortcuts",520){Heading("Google, close by");Note("These shortcuts open your signed-in Google pages. Review and finish any draft or event there. Nothing is sent or saved by a web shortcut alone.");Panel.Children.Add(Button("Desktop Google connections",delegate{Close();owner.OpenGoogleConnections();}));Panel.Children.Add(Button("Open Gmail",delegate{Open("https://mail.google.com/");}));Panel.Children.Add(Button("Open Google Calendar",delegate{Open("https://calendar.google.com/");}));Note("For automatic mail and Calendar alerts, connect a personal Desktop OAuth client in Google connections. The desktop app checks directly, including when browsers are closed. Your own project supplies its API quota; no publisher account or credentials are bundled.");Note("Try: show unread emails, show calendar tomorrow, or schedule event Planning tomorrow at 3pm for 30 min. Google web actions still require your review.");}
  void Open(string url){try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch{Note("Windows could not open your browser.");}}
 }
}

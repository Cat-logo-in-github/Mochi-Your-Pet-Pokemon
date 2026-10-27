using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
namespace MochiDesktop {
 public static class ReminderActions {
  public static string FindExplicitUrl(string text,out string error){
   error=null;text=text??"";
   var links=Regex.Matches(text,@"\bhttps?://[^\s<>""']+",RegexOptions.IgnoreCase).Cast<Match>().Select(m=>m.Value).ToList();
   if(links.Count>1){error="Use one website link per scheduled action.";return null;}
   if(links.Count==0){if(Regex.IsMatch(text,@"\b(?:[a-z][a-z0-9+.-]*://|javascript:|data:|file:|shell:)",RegexOptions.IgnoreCase))error="Scheduled websites must use a full http:// or https:// link.";return null;}
   string candidate=links[0];
   // Strip only paired prose wrappers; sentence characters inside a URL are kept intact.
   if(candidate.EndsWith(")")&&candidate.Count(c=>c==')')>candidate.Count(c=>c=='('))candidate=candidate.Substring(0,candidate.Length-1);
   string safe=Commands.SafeUrl(candidate);if(safe==null)error="That website link is not valid. Use HTTP/HTTPS without credentials or backslashes.";return safe;
  }
  public static void Configure(Reminder reminder,string url,bool optIn){string safe=Commands.SafeUrl(url);if(optIn&&safe==null)throw new ArgumentException("Choose one full HTTP/HTTPS website link before enabling automatic opening.");reminder.ActionUrl=safe;reminder.OpenUrlOnDue=optIn;reminder.LastActionClaimUtcTicks=0;}
  public static Reminder Snooze(string title,string url,DateTime dueUtc){var reminder=ReminderEngine.Create(title,dueUtc,"none");Configure(reminder,url,false);return reminder;}
  public static void Normalize(Reminder reminder){if(reminder==null)return;reminder.ActionUrl=Commands.SafeUrl(reminder.ActionUrl);if(reminder.ActionUrl==null)reminder.OpenUrlOnDue=false;if(reminder.LastActionClaimUtcTicks<0||reminder.LastActionClaimUtcTicks>DateTime.MaxValue.Ticks)reminder.LastActionClaimUtcTicks=0;}
  public static bool Claim(Reminder reminder,long occurrence){if(!reminder.OpenUrlOnDue||Commands.SafeUrl(reminder.ActionUrl)==null||reminder.LastActionClaimUtcTicks==occurrence)return false;reminder.LastActionClaimUtcTicks=occurrence;return true;}
  // The caller must persist ClaimDue's original reminder before invoking this side effect.
  public static string ExecuteClaimed(Reminder due,Action<string> open){if(!due.OpenUrlOnDue)return null;string url=Commands.SafeUrl(due.ActionUrl);if(url==null)return "Website opening was blocked: this is not a safe HTTP/HTTPS link.";try{open(url);return "Link sent to your default browser.";}catch{return "Mochi could not open the link. Open it manually in your browser.";}}
 }
}

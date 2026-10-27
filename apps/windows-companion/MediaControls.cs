// Direct, on-demand Windows media sessions. No simulated keypresses, network, or polling service.
// API: https://learn.microsoft.com/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace MochiDesktop {
    public sealed class MediaSessionInfo {
        public string Id, App, Title, Artist, Playback;
        public bool CanPlay, CanPause, CanNext, CanPrevious, CanStop, IsCurrent;
        public override string ToString() { return (string.IsNullOrWhiteSpace(Title) ? App : Title) + " / " + App; }
    }
    public static class NativeMedia {
        private static readonly SemaphoreSlim Gate = new SemaphoreSlim(1, 1);
        private static readonly Dictionary<string, object> Sessions = new Dictionary<string, object>();
        private static object manager;
        private static MethodInfo asTask;
        private const int TimeoutMilliseconds = 6000;
        public static bool IsAction(string action) { return new[] { "play", "pause", "toggle", "next", "previous", "stop" }.Contains(action); }
        public static bool CanControl(MediaSessionInfo session, string action) {
            if (session == null) return false;
            switch (action) {
                case "play": return session.CanPlay;
                case "pause": return session.CanPause;
                case "toggle": return session.CanPlay || session.CanPause;
                case "next": return session.CanNext;
                case "previous": return session.CanPrevious;
                case "stop": return session.CanStop;
                default: return false;
            }
        }
        public static async Task<List<MediaSessionInfo>> ListAsync() {
            await Gate.WaitAsync().ConfigureAwait(false);
            try {
                object service = await ManagerAsync().ConfigureAwait(false);
                var live = ((IEnumerable)Call(service, "GetSessions")).Cast<object>().Take(32).ToList();
                object current = Call(service, "GetCurrentSession");
                var retained = new Dictionary<string, object>();
                var inspections = new List<Task<MediaSessionInfo>>();
                foreach (object session in live) {
                    string id = Sessions.Where(pair => object.Equals(pair.Value, session)).Select(pair => pair.Key).FirstOrDefault() ?? Guid.NewGuid().ToString("N");
                    retained[id] = session;
                    inspections.Add(InspectAsync(session, current, id));
                }
                MediaSessionInfo[] result = await Task.WhenAll(inspections).ConfigureAwait(false);
                Sessions.Clear(); foreach (var pair in retained) Sessions[pair.Key] = pair.Value;
                return result.OrderByDescending(item => item.IsCurrent).ThenBy(item => item.App).ToList();
            } catch (Exception error) { throw Explain(error); }
            finally { Gate.Release(); }
        }
        public static async Task<bool> ControlAsync(string sessionId, string action) {
            if (!IsAction(action)) throw new ArgumentException("Choose Play, Pause, Toggle, Next, Previous, or Stop.", "action");
            await Gate.WaitAsync().ConfigureAwait(false);
            try {
                await ManagerAsync().ConfigureAwait(false);
                object session;
                if (string.IsNullOrEmpty(sessionId)) session = Call(manager, "GetCurrentSession");
                else if (!Sessions.TryGetValue(sessionId, out session)) throw new InvalidOperationException("That player is no longer available. Refresh players and choose one again.");
                if (session == null) throw new InvalidOperationException("No active Windows media player. Start a song or video in your browser or music app, then refresh players.");
                string method;
                switch (action) {
                    case "play": method = "TryPlayAsync"; break;
                    case "pause": method = "TryPauseAsync"; break;
                    // Windows resolves this against the live session, even when the panel snapshot is stale.
                    case "toggle": method = "TryTogglePlayPauseAsync"; break;
                    case "next": method = "TrySkipNextAsync"; break;
                    case "previous": method = "TrySkipPreviousAsync"; break;
                    default: method = "TryStopAsync"; break;
                }
                // The operating system's actual accepted result is returned; sending a request is not reported as playback success.
                return (bool)await OperationAsync(Call(session, method), typeof(bool)).ConfigureAwait(false);
            } catch (Exception error) { throw Explain(error); }
            finally { Gate.Release(); }
        }
        private static async Task<MediaSessionInfo> InspectAsync(object session, object current, string id) {
            string appId = Text(Property(session, "SourceAppUserModelId"), "Media player");
            var info = new MediaSessionInfo { Id = id, App = FriendlyApp(appId), Title = "", Artist = "", Playback = "Unknown", IsCurrent = object.Equals(current, session) };
            try {
                object properties = await OperationAsync(Call(session, "TryGetMediaPropertiesAsync"), RuntimeType("GlobalSystemMediaTransportControlsSessionMediaProperties")).ConfigureAwait(false);
                info.Title = Text(Property(properties, "Title"), "");
                info.Artist = Text(Property(properties, "Artist"), "");
            } catch { /* A closing player must not hide the remaining sessions. */ }
            try {
                object playback = Call(session, "GetPlaybackInfo");
                info.Playback = Text(Property(playback, "PlaybackStatus"), "Unknown");
                object controls = Property(playback, "Controls");
                info.CanPlay = Flag(controls, "IsPlayEnabled"); info.CanPause = Flag(controls, "IsPauseEnabled");
                info.CanNext = Flag(controls, "IsNextEnabled"); info.CanPrevious = Flag(controls, "IsPreviousEnabled"); info.CanStop = Flag(controls, "IsStopEnabled");
            } catch { /* Disabled controls accurately represent an unavailable session. */ }
            return info;
        }
        private static async Task<object> ManagerAsync() {
            if (manager != null) return manager;
            Type type = Type.GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime", false);
            if (type == null) throw new PlatformNotSupportedException("Windows media controls require Windows 10 version 1809 or later.");
            manager = await OperationAsync(type.GetMethod("RequestAsync").Invoke(null, null), type).ConfigureAwait(false);
            return manager;
        }
        private static Type RuntimeType(string name) { return Type.GetType("Windows.Media.Control." + name + ", Windows.Media, ContentType=WindowsRuntime", true); }
        private static async Task<object> OperationAsync(object operation, Type resultType) {
            if (operation == null) throw new InvalidOperationException("The media player did not return a response.");
            if (asTask == null) {
                var assembly = Assembly.Load("System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089");
                asTask = assembly.GetType("System.WindowsRuntimeSystemExtensions", true).GetMethods(BindingFlags.Public | BindingFlags.Static).First(method => method.Name == "AsTask" && method.IsGenericMethodDefinition && method.GetGenericArguments().Length == 1 && method.GetParameters().Length == 1 && method.GetParameters()[0].ParameterType.Name == "IAsyncOperation`1");
            }
            var task = (Task)asTask.MakeGenericMethod(resultType).Invoke(null, new[] { operation });
            using (var timer = new CancellationTokenSource()) {
                Task limit = Task.Delay(TimeoutMilliseconds, timer.Token);
                if (await Task.WhenAny(task, limit).ConfigureAwait(false) != task) {
                    try {
                        Type asyncInfo = Type.GetType("Windows.Foundation.IAsyncInfo, Windows.Foundation, ContentType=WindowsRuntime", false);
                        if (asyncInfo != null) asyncInfo.GetMethod("Cancel").Invoke(operation, null);
                    } catch { }
                    // Observe a later native failure even after the bounded UI request has timed out.
                    ObserveLateFailure(task);
                    throw new TimeoutException("The media player did not respond. Refresh players and try again.");
                }
                timer.Cancel();
                await task.ConfigureAwait(false);
                return task.GetType().GetProperty("Result").GetValue(task, null);
            }
        }
        private static void ObserveLateFailure(Task task) { task.ContinueWith(finished => { var observed = finished.Exception; }, TaskContinuationOptions.OnlyOnFaulted); }
        private static object Call(object target, string method) { return target.GetType().GetMethod(method).Invoke(target, null); }
        private static object Property(object target, string name) { return target.GetType().GetProperty(name).GetValue(target, null); }
        private static bool Flag(object target, string name) { try { return (bool)Property(target, name); } catch { return false; } }
        private static string Text(object value, string fallback) { string text = Convert.ToString(value); return string.IsNullOrWhiteSpace(text) ? fallback : new string(text.Where(character => !char.IsControl(character)).Take(240).ToArray()); }
        private static string FriendlyApp(string source) {
            string name = source.ToLowerInvariant();
            if (name.Contains("msedge")) return "Microsoft Edge";
            if (name.Contains("chrome")) return "Google Chrome";
            if (name.Contains("firefox")) return "Firefox";
            if (name.Contains("spotify")) return "Spotify";
            return source;
        }
        private static InvalidOperationException Explain(Exception error) {
            while (error is TargetInvocationException && error.InnerException != null) error = error.InnerException;
            if (error is UnauthorizedAccessException || error is COMException && error.HResult == unchecked((int)0x80070005))
                return new InvalidOperationException("Windows denied access to active media players. Run Mochi in your signed-in desktop session; protected or elevated players may be unavailable.", error);
            if (error is PlatformNotSupportedException || error is TypeLoadException || error is System.IO.FileNotFoundException)
                return new InvalidOperationException("Windows media controls require Windows 10 version 1809 or later with .NET Framework 4.8.", error);
            return new InvalidOperationException(error is InvalidOperationException || error is TimeoutException || error is ArgumentException ? error.Message : "The media player closed or could not answer. Refresh players and try again.", error);
        }
    }
}

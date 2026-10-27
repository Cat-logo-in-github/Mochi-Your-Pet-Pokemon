// Credited 2D sprite playback. Authentic source frames are cropped without interpolation.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace MochiDesktop {
    [DataContract] public sealed class PetClip {
        [DataMember(Name="action")] public string Action;
        [DataMember(Name="skin")] public string Skin;
        [DataMember(Name="direction")] public string Direction;
        [DataMember(Name="fps")] public double Fps;
        [DataMember(Name="frameCount")] public int FrameCount;
        [DataMember(Name="loop")] public bool Loop;
        [DataMember(Name="atlases")] public string[] Atlases;
        [DataMember(Name="frameDurationsMs",EmitDefaultValue=false)] public double[] FrameDurationsMs;
        double[] frameEnds;
        internal double[] FrameEnds {get {if(frameEnds==null&&FrameDurationsMs!=null){frameEnds=new double[FrameDurationsMs.Length];double total=0;for(int i=0;i<frameEnds.Length;i++){total+=FrameDurationsMs[i];frameEnds[i]=total;}}return frameEnds;}}
        public double DurationSeconds { get {var ends=FrameEnds;return ends!=null&&ends.Length>0?ends[ends.Length-1]/1000:FrameCount/Fps;} }
    }
    [DataContract] public sealed class PetManifest {
        [DataMember(Name="version")] public int Version;
        [DataMember(Name="render")] public string Render;
        [DataMember(Name="tileSize")] public int TileSize;
        [DataMember(Name="columns")] public int Columns;
        [DataMember(Name="rows")] public int Rows;
        [DataMember(Name="framesPerAtlas")] public int FramesPerAtlas;
        [DataMember(Name="clips")] public Dictionary<string,PetClip> Clips;
    }
    public static class PetTimeline {
        public static readonly string[] Directions={"front","front-right","right","back-right","back","back-left","left","front-left"};
        public static readonly string[] Species={"eevee","vaporeon","jolteon","flareon","espeon","umbreon","leafeon","glaceon","sylveon"};
        public static bool IsAction(string action){return action!=null&&(Actions.Contains(action)||Regex.IsMatch(action,@"\Apmd_[a-z0-9][a-z0-9_]{0,63}\z"));}
        public static string SpeciesName(string species){return Species.Contains(species)?char.ToUpperInvariant(species[0])+species.Substring(1):"Eevee";}
        public static readonly string[] Actions={"idle","walk","run","turn","stretch","groom","pounce","play","feed","happy","sleep","alert","carry"};
        public static string ActionForMood(string mood) {
            switch(mood){case "walking":return "walk";case "following":return "run";case "curious":return "turn";case "sleeping":return "sleep";case "notification":return "alert";case "dragged":return "carry";case "music":return "play";case "blink":return "idle";default:return IsAction(mood)?mood:"idle";}
        }
        public static Int32Rect TileRect(int frame){int tile=Math.Max(0,frame)%32;return new Int32Rect((tile%8)*256,(tile/8)*256,256,256);}
        public static int FrameAt(PetClip clip,double elapsedMilliseconds) {
            if(clip==null||clip.FrameCount<1||clip.Fps<=0)return 0;
            double duration=clip.DurationSeconds*1000,elapsed=double.IsNaN(elapsedMilliseconds)?0:Math.Max(0,elapsedMilliseconds);
            if(double.IsInfinity(elapsed))return clip.FrameCount-1;
            if(clip.Loop)elapsed%=duration;else if(elapsed>=duration)return clip.FrameCount-1;
            double[] ends=clip.FrameEnds;
            if(ends==null)return (int)Math.Min(clip.FrameCount-1,Math.Floor(elapsed*clip.Fps/1000));
            int low=0,high=ends.Length-1;while(low<high){int mid=(low+high)/2;if(elapsed<ends[mid])high=mid;else low=mid+1;}return low;
        }
        // Wake once for the next authentic frame change; long source holds need no repeated redraws.
        public static double NextFrameDelay(PetClip clip,double elapsedMilliseconds){
            if(clip==null||clip.FrameCount<=1)return double.PositiveInfinity;
            double duration=clip.DurationSeconds*1000,elapsed=Math.Max(0,elapsedMilliseconds);
            if(!clip.Loop&&elapsed>=duration)return double.PositiveInfinity;
            if(clip.Loop)elapsed%=duration;
            int index=FrameAt(clip,elapsed);double boundary=clip.FrameEnds==null?(index+1)*1000/clip.Fps:clip.FrameEnds[index];
            if(!clip.Loop&&index==clip.FrameCount-1)return double.PositiveInfinity;
            return Math.Max(1,boundary-elapsed);
        }
        public static string Heading(double dx,double dy) {
            if(Math.Abs(dx)+Math.Abs(dy)<.001)return "front";
            double angle=Math.Atan2(dx,dy)*180/Math.PI;if(angle<0)angle+=360;
            return Directions[((int)Math.Floor((angle+22.5)/45))%8];
        }
        public static PetClip Select(PetManifest manifest,string action,string skin,string direction) {
            if(manifest==null||manifest.Clips==null)return null;
            action=ActionForMood(action);PetClip clip;
            if(manifest.Clips.TryGetValue(action+"_"+skin+"_"+direction,out clip))return clip;
            int wanted=Array.IndexOf(Directions,direction);if(wanted<0)wanted=0;
            var available=manifest.Clips.Values.Where(c=>c.Action==action&&c.Skin==skin).ToList();
            if(available.Count>0)return available.OrderBy(c=>{int index=Array.IndexOf(Directions,c.Direction);if(index<0)return 100;int distance=Math.Abs(index-wanted);return Math.Min(distance,8-distance);}).ThenBy(c=>c.Direction=="front"?0:1).First();
            if(manifest.Clips.TryGetValue("idle_"+skin+"_front",out clip))return clip;
            return manifest.Clips.Values.FirstOrDefault(c=>c.Action=="idle"&&c.Skin=="eevee"&&c.Direction=="front");
        }
        public static string SafeAssetPath(string root,string relative) {
            if(string.IsNullOrWhiteSpace(relative)||relative.Length>240||!Regex.IsMatch(relative,@"\Aatlases/[A-Za-z0-9_/-]+\.png\z")||relative.Split('/').Any(s=>s.Length==0||s==".."||s=="."))throw new InvalidDataException("Unsafe pet atlas path.");
            string prefix=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
            string path=Path.GetFullPath(Path.Combine(prefix,relative.Replace('/',Path.DirectorySeparatorChar)));
            if(!path.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Pet atlas escaped its asset folder.");
            return path;
        }
        public static void Validate(PetManifest m,bool complete) {
            if(m==null||m.Version!=2||m.Render!="sprite-sheet-2d"||m.TileSize!=256||m.Columns!=8||m.Rows!=4||m.FramesPerAtlas!=32||m.Clips==null||m.Clips.Count<1||m.Clips.Count>4096)throw new InvalidDataException("Unsupported Mochi sprite manifest.");
            foreach(var pair in m.Clips){PetClip c=pair.Value;
                if(c==null||!IsAction(c.Action)||!Species.Contains(c.Skin)||!Directions.Contains(c.Direction)||double.IsNaN(c.Fps)||double.IsInfinity(c.Fps)||c.Fps<.5||c.Fps>60||c.FrameCount<1||c.FrameCount>1800||c.Atlases==null||c.Atlases.Length!=(c.FrameCount+31)/32||pair.Key!=c.Action+"_"+c.Skin+"_"+c.Direction)throw new InvalidDataException("Invalid Mochi sprite clip metadata.");
                if(c.FrameDurationsMs!=null&&(c.FrameDurationsMs.Length!=c.FrameCount||c.FrameDurationsMs.Any(ms=>double.IsNaN(ms)||double.IsInfinity(ms)||ms<16||ms>120000)||c.FrameDurationsMs.Sum()>600000))throw new InvalidDataException("Invalid sprite frame holds.");
                foreach(string atlas in c.Atlases)SafeAssetPath(Path.GetTempPath(),atlas);
            }
            if(complete)foreach(string species in Species)foreach(string action in Actions)if(!m.Clips.Values.Any(c=>c.Skin==species&&c.Action==action&&c.Direction=="front"))throw new InvalidDataException("The sprite pack is missing a required action or character.");
            if(complete)foreach(string species in Species)foreach(string action in new[]{"walk","run"})foreach(string direction in Directions)if(!m.Clips.ContainsKey(action+"_"+species+"_"+direction))throw new InvalidDataException("Sprite locomotion must include eight source directions for each character.");
        }
    }
    public sealed class PetAssets {
        public readonly string Root;public readonly PetManifest Manifest;public readonly bool Complete;
        public PetAssets(string root,bool complete) {
            Root=Path.GetFullPath(root);string file=Path.Combine(Root,"manifest.json");
            if(!File.Exists(file)||new FileInfo(file).Length>2000000)throw new InvalidDataException("Mochi sprite artwork is missing or invalid.");
            var serializer=new DataContractJsonSerializer(typeof(PetManifest),new DataContractJsonSerializerSettings{UseSimpleDictionaryFormat=true});
            using(var stream=File.OpenRead(file))Manifest=(PetManifest)serializer.ReadObject(stream);
            PetTimeline.Validate(Manifest,false);try{PetTimeline.Validate(Manifest,true);foreach(string credit in new[]{"CREDITS.md","LICENSE-SpriteCollab.md","SOURCE.json"})if(!File.Exists(Path.Combine(Root,credit)))throw new InvalidDataException("Required sprite credits are missing.");Complete=true;}catch{if(complete)throw;}
            foreach(string relative in Manifest.Clips.Values.SelectMany(c=>c.Atlases).Distinct())ValidatePng(PetTimeline.SafeAssetPath(Root,relative));
        }
        public static void ValidatePng(string path) {
            using(var file=File.OpenRead(path)){byte[] h=new byte[26];if(file.Read(h,0,h.Length)!=h.Length||h[0]!=137||h[1]!=80||h[2]!=78||h[3]!=71||h[12]!=73||h[13]!=72||h[14]!=68||h[15]!=82)throw new InvalidDataException("Invalid pet atlas PNG.");int width=(h[16]<<24)|(h[17]<<16)|(h[18]<<8)|h[19],height=(h[20]<<24)|(h[21]<<16)|(h[22]<<8)|h[23];if(width!=2048||height!=1024||h[24]!=8||h[25]!=6)throw new InvalidDataException("Pet atlases must be 2048 x 1024 8-bit RGBA PNGs.");}
        }
    }
    public static class SpritePixels {
        public static Rect VisibleBounds(BitmapSource source){
            if(source==null)return new Rect(.3,.55,.4,.3);BitmapSource image=source;if(image.Format!=PixelFormats.Pbgra32&&image.Format!=PixelFormats.Bgra32)image=new FormatConvertedBitmap(image,PixelFormats.Pbgra32,null,0);
            int w=image.PixelWidth,h=image.PixelHeight,stride=w*4;byte[] pixels=new byte[stride*h];image.CopyPixels(pixels,stride,0);int left=w,top=h,right=-1,bottom=-1;
            for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(pixels[y*stride+x*4+3]>=32){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}return right<left?new Rect(.3,.55,.4,.3):new Rect(left/(double)w,top/(double)h,(right-left+1)/(double)w,(bottom-top+1)/(double)h);
        }
        public static BitmapSource TrimmedPoster(BitmapSource source){
            BitmapSource image=source;if(image.Format!=PixelFormats.Pbgra32&&image.Format!=PixelFormats.Bgra32)image=new FormatConvertedBitmap(image,PixelFormats.Pbgra32,null,0);
            int width=image.PixelWidth,height=image.PixelHeight,stride=width*4;byte[] pixels=new byte[stride*height];image.CopyPixels(pixels,stride,0);int left=width,top=height,right=-1,bottom=-1;
            for(int y=0;y<height;y++)for(int x=0;x<width;x++)if(pixels[y*stride+x*4+3]>=32){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}
            if(right<left)return source;left=Math.Max(0,left-4);top=Math.Max(0,top-4);right=Math.Min(width-1,right+4);bottom=Math.Min(height-1,bottom+4);
            var crop=new CroppedBitmap(image,new Int32Rect(left,top,right-left+1,bottom-top+1));crop.Freeze();return crop;
        }
        // Called only by accessibility, never for animation redraws.
        public static Point OpaquePoint(BitmapSource source){
            if(source==null)return new Point(.5,.5);
            BitmapSource image=source;if(image.Format!=PixelFormats.Pbgra32&&image.Format!=PixelFormats.Bgra32)image=new FormatConvertedBitmap(image,PixelFormats.Pbgra32,null,0);
            int width=image.PixelWidth,height=image.PixelHeight,stride=width*4;byte[] pixels=new byte[stride*height];image.CopyPixels(pixels,stride,0);
            double cx=width/2.0,cy=height/2.0,best=double.PositiveInfinity;int bestX=width/2,bestY=height/2;
            for(int y=0;y<height;y++)for(int x=0;x<width;x++)if(pixels[y*stride+x*4+3]>=128){double dx=x+.5-cx,dy=y+.5-cy,distance=dx*dx+dy*dy;if(distance<best){best=distance;bestX=x;bestY=y;}}
            return new Point((bestX+.5)/width,(bestY+.5)/height);
        }
    }
    [DataContract] public sealed class PetPlaybackStats {
        [DataMember] public int DisplayedFrames;
        [DataMember] public int AtlasTransitions;
        [DataMember] public int BoundaryMisses;
        [DataMember] public int DecodedAtlases;
        [DataMember] public int PeakLiveAtlasSlots;
        [DataMember] public double FirstFrameWaitMilliseconds;
        [DataMember] public double MaximumDecodeMilliseconds;
        [DataMember] public double MaximumUiTickMilliseconds;
    }
    public sealed class AtlasPlayer : IDisposable {
        sealed class AtlasEntry {public string Path;public BitmapSource Bitmap;public long Used;}
        readonly FrameworkElement owner;readonly Action invalidate;readonly DispatcherTimer timer;
        readonly Stopwatch clock=new Stopwatch(),firstFrameWait=new Stopwatch();
        readonly PetPlaybackStats stats=new PetPlaybackStats();string lastBoundaryMiss;
        readonly List<AtlasEntry> cache=new List<AtlasEntry>();readonly HashSet<string> failed=new HashSet<string>();long used;
        PetAssets assets;PetClip clip;string clipKey,currentAtlas,previousAtlas,desiredActive,desiredNext,pendingAtlas;
        BitmapSource currentFrame,previousFrame;int currentIndex=-1;bool active=true,awaitingFirstFrame;volatile bool disposed;
        public string Error {get;private set;}
        public PetPlaybackStats Statistics {get{return stats;}}
        public bool Available {get{return assets!=null;}}
        public bool Complete {get{return assets!=null&&assets.Complete;}}
        public bool HasFrame {get{return currentFrame!=null||previousFrame!=null;}}
        public bool WaitingForFrame {get{return awaitingFirstFrame;}}
        public bool IsFrameTimerRunning {get{return timer.IsEnabled;}}
        public bool IsBlending {get{return false;}}
        public string[] ExtraActions(string skin){return assets==null?new string[0]:assets.Manifest.Clips.Values.Where(c=>c.Skin==skin&&c.Action.StartsWith("pmd_",StringComparison.Ordinal)).Select(c=>c.Action).Distinct().OrderBy(x=>x).ToArray();}
        public double ElapsedSeconds {get{return clock.Elapsed.TotalSeconds;}}
        public int CachedAtlasCount {get{return cache.Count;}}
        public int LiveAtlasSlots {get{return cache.Count+(pendingAtlas==null?0:1);}}
        public double DurationSeconds {get{return clip==null?0:clip.DurationSeconds;}}
        public Point InteractionPoint {get{return SpritePixels.OpaquePoint(currentFrame??previousFrame);}}
        public Rect VisibleBounds {get{return SpritePixels.VisibleBounds(currentFrame??previousFrame);}}
        public AtlasPlayer(FrameworkElement element,Action redraw,string assetRootOverride=null) {
            owner=element;invalidate=redraw;timer=new DispatcherTimer(DispatcherPriority.Render,owner.Dispatcher);timer.Tick+=delegate{UpdateFrame();};
            try{assets=new PetAssets(assetRootOverride??Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","mochi"),false);}catch{Error="Sprite artwork unavailable. Keep the complete assets folder beside Mochi.exe.";}
        }
        public void Play(string mood,string skin,string direction,bool restart) {
            if(disposed)return;if(assets==null){invalidate();return;}
            PetClip next=PetTimeline.Select(assets.Manifest,mood,skin,direction);if(next==null)return;
            string nextKey=next.Action+"_"+next.Skin+"_"+next.Direction;if(!restart&&nextKey==clipKey)return;
            if(currentFrame!=null){previousFrame=currentFrame;previousAtlas=currentAtlas;}
            currentFrame=null;currentAtlas=null;currentIndex=-1;clip=next;clipKey=nextKey;desiredActive=null;desiredNext=null;awaitingFirstFrame=true;firstFrameWait.Restart();lastBoundaryMiss=null;clock.Reset();
            timer.Stop();UpdateFrame();
        }
        public void SetActive(bool value){if(disposed||active==value)return;active=value;if(value){if(!awaitingFirstFrame)clock.Start();UpdateFrame();}else{clock.Stop();timer.Stop();}}
        public void Draw(DrawingContext dc,Rect target){if(currentFrame!=null)dc.DrawImage(currentFrame,target);else if(previousFrame!=null)dc.DrawImage(previousFrame,target);}
        AtlasEntry Find(string path){return cache.FirstOrDefault(e=>e.Path==path);}
        void Trim(int maximum){while(cache.Count>maximum){AtlasEntry victim=cache.Where(e=>e.Path!=currentAtlas&&e.Path!=previousAtlas).OrderBy(e=>e.Used).FirstOrDefault();if(victim==null)throw new InvalidOperationException("Atlas cache protection exceeded its two-frame bound.");cache.Remove(victim);}}
        bool Needed(string path){return path==desiredActive||path==desiredNext||path==currentAtlas||path==previousAtlas;}
        void ScheduleDecode(){
            if(disposed||pendingAtlas!=null)return;
            string path=desiredActive!=null&&Find(desiredActive)==null&&!failed.Contains(desiredActive)?desiredActive:active&&desiredNext!=null&&Find(desiredNext)==null&&!failed.Contains(desiredNext)?desiredNext:null;
            if(path==null)return;
            // Two cache slots plus one in-flight decode is the hard three-atlas bound.
            Trim(2);pendingAtlas=path;stats.PeakLiveAtlasSlots=Math.Max(stats.PeakLiveAtlasSlots,LiveAtlasSlots);
            Task.Run(delegate{
                BitmapSource decoded=null;bool success=false;long decodeStarted=Stopwatch.GetTimestamp();
                try{var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.CreateOptions=BitmapCreateOptions.PreservePixelFormat|BitmapCreateOptions.IgnoreImageCache;image.UriSource=new Uri(path,UriKind.Absolute);image.EndInit();if(image.PixelWidth!=2048||image.PixelHeight!=1024)throw new InvalidDataException("Invalid atlas dimensions.");image.Freeze();decoded=image;success=true;}catch{ }
                if(disposed||owner.Dispatcher.HasShutdownStarted)return;
                owner.Dispatcher.BeginInvoke(DispatcherPriority.Render,new Action(delegate{
                    pendingAtlas=null;if(disposed){decoded=null;return;}stats.MaximumDecodeMilliseconds=Math.Max(stats.MaximumDecodeMilliseconds,(Stopwatch.GetTimestamp()-decodeStarted)*1000.0/Stopwatch.Frequency);
                    if(success&&Needed(path)){cache.Add(new AtlasEntry{Path=path,Bitmap=decoded,Used=++used});stats.DecodedAtlases++;Trim(3);stats.PeakLiveAtlasSlots=Math.Max(stats.PeakLiveAtlasSlots,LiveAtlasSlots);}
                    else if(!success){failed.Add(path);Error="A sprite atlas could not be read. Reinstall the complete portable folder.";}
                    decoded=null;UpdateFrame();ScheduleDecode();
                }));
            });
        }
        void UpdateFrame(){
            if(disposed||clip==null)return;timer.Stop();long uiStarted=Stopwatch.GetTimestamp();
            try{
                int index=awaitingFirstFrame?0:PetTimeline.FrameAt(clip,clock.Elapsed.TotalMilliseconds),page=index/32;
                desiredActive=PetTimeline.SafeAssetPath(assets.Root,clip.Atlases[page]);
                int next=page+1;if(next>=clip.Atlases.Length&&clip.Loop)next=0;desiredNext=next<clip.Atlases.Length&&next!=page?PetTimeline.SafeAssetPath(assets.Root,clip.Atlases[next]):null;
                AtlasEntry atlas=Find(desiredActive);
                if(atlas==null){if(!awaitingFirstFrame&&currentAtlas!=desiredActive&&lastBoundaryMiss!=desiredActive){stats.BoundaryMisses++;lastBoundaryMiss=desiredActive;}if(failed.Contains(desiredActive)){timer.Stop();clock.Stop();invalidate();return;}ScheduleDecode();return;}
                atlas.Used=++used;bool changed=index!=currentIndex||currentAtlas!=desiredActive;
                if(changed){if(currentIndex>=0&&index/32!=currentIndex/32)stats.AtlasTransitions++;stats.DisplayedFrames++;currentAtlas=desiredActive;var crop=new CroppedBitmap(atlas.Bitmap,PetTimeline.TileRect(index));crop.Freeze();currentFrame=crop;currentIndex=index;
                    if(awaitingFirstFrame){awaitingFirstFrame=false;firstFrameWait.Stop();if(stats.FirstFrameWaitMilliseconds==0)stats.FirstFrameWaitMilliseconds=firstFrameWait.Elapsed.TotalMilliseconds;clock.Restart();if(!active)clock.Stop();previousFrame=null;previousAtlas=null;Trim(3);}
                }
                ScheduleDecode();if(changed)invalidate();
                // Leave the logical clock running so a caller's longer minimum reaction can hold the final frame without timer work.
                double delay=PetTimeline.NextFrameDelay(clip,clock.Elapsed.TotalMilliseconds);if(active&&!awaitingFirstFrame&&!double.IsInfinity(delay)){timer.Interval=TimeSpan.FromMilliseconds(Math.Min(2000000000,delay));timer.Start();}
            }catch{timer.Stop();clock.Stop();Error="A sprite atlas could not be read. Reinstall the complete portable folder.";invalidate();}
            finally{stats.MaximumUiTickMilliseconds=Math.Max(stats.MaximumUiTickMilliseconds,(Stopwatch.GetTimestamp()-uiStarted)*1000.0/Stopwatch.Frequency);}
        }
        public void Dispose(){disposed=true;timer.Stop();clock.Stop();cache.Clear();currentFrame=null;previousFrame=null;}
    }
}

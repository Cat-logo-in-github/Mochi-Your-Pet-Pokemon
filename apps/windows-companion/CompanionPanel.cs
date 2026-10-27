// Native companion UI: local, accessible WPF controls with no permanent frame around the pet.


using System;


using System.Linq;


using System.Windows;


using System.Windows.Controls;


using System.Windows.Controls.Primitives;


using System.Windows.Input;


using System.Windows.Markup;


using System.Windows.Media;


using System.Windows.Media.Effects;


using System.Windows.Shapes;


using Forms=System.Windows.Forms;





namespace MochiDesktop {


    public static class MochiTheme {


        public static readonly Brush Ink=ColorBrush("#44384E"),Muted=ColorBrush("#776C80"),Cream=ColorBrush("#FFFBF6"),Lavender=ColorBrush("#ECE2F8"),Purple=ColorBrush("#76579A"),Line=ColorBrush("#E7DFEC"),Danger=ColorBrush("#9D465E");


        public static Brush ColorBrush(string hex){var b=new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));b.Freeze();return b;}


        const string Resources=@"<ResourceDictionary xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'>


<Style TargetType='{x:Type Button}'><Setter Property='Background' Value='#F5EFF9'/><Setter Property='Foreground' Value='#493A55'/><Setter Property='BorderBrush' Value='#E4D9EC'/><Setter Property='BorderThickness' Value='1'/><Setter Property='Padding' Value='13,9'/><Setter Property='FontFamily' Value='Segoe UI'/><Setter Property='FontSize' Value='13'/><Setter Property='FontWeight' Value='SemiBold'/><Setter Property='Cursor' Value='Hand'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type Button}'><Border x:Name='frame' Background='{TemplateBinding Background}' BorderBrush='{TemplateBinding BorderBrush}' BorderThickness='{TemplateBinding BorderThickness}' CornerRadius='13' Padding='{TemplateBinding Padding}'><ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center' RecognizesAccessKey='True'/></Border><ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'><Setter TargetName='frame' Property='Opacity' Value='0.84'/></Trigger><Trigger Property='IsPressed' Value='True'><Setter TargetName='frame' Property='Opacity' Value='0.65'/></Trigger><Trigger Property='IsKeyboardFocused' Value='True'><Setter TargetName='frame' Property='BorderBrush' Value='#76579A'/><Setter TargetName='frame' Property='BorderThickness' Value='2'/></Trigger><Trigger Property='IsEnabled' Value='False'><Setter TargetName='frame' Property='Opacity' Value='0.42'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type TextBox}'><Setter Property='Background' Value='White'/><Setter Property='Foreground' Value='#44384E'/><Setter Property='BorderBrush' Value='#E3DAEA'/><Setter Property='BorderThickness' Value='1'/><Setter Property='Padding' Value='11,9'/><Setter Property='FontSize' Value='13'/><Setter Property='CaretBrush' Value='#76579A'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type TextBox}'><Border x:Name='frame' Background='{TemplateBinding Background}' BorderBrush='{TemplateBinding BorderBrush}' BorderThickness='{TemplateBinding BorderThickness}' CornerRadius='11' Padding='{TemplateBinding Padding}'><ScrollViewer x:Name='PART_ContentHost'/></Border><ControlTemplate.Triggers><Trigger Property='IsKeyboardFocused' Value='True'><Setter TargetName='frame' Property='BorderBrush' Value='#9271B5'/><Setter TargetName='frame' Property='BorderThickness' Value='2'/></Trigger><Trigger Property='IsEnabled' Value='False'><Setter TargetName='frame' Property='Opacity' Value='0.5'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type ComboBox}'><Setter Property='Background' Value='White'/><Setter Property='Foreground' Value='#44384E'/><Setter Property='BorderBrush' Value='#E3DAEA'/><Setter Property='Padding' Value='11,9'/><Setter Property='FontSize' Value='13'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type ComboBox}'><Grid><ToggleButton Focusable='False' IsChecked='{Binding IsDropDownOpen,RelativeSource={RelativeSource TemplatedParent},Mode=TwoWay}'><ToggleButton.Template><ControlTemplate TargetType='{x:Type ToggleButton}'><Border Background='White' BorderBrush='#E3DAEA' BorderThickness='1' CornerRadius='11'><Path Data='M0,0 L4,4 L8,0' Stroke='#78658D' StrokeThickness='1.5' HorizontalAlignment='Right' VerticalAlignment='Center' Margin='0,0,13,0'/></Border></ControlTemplate></ToggleButton.Template></ToggleButton><ContentPresenter Content='{TemplateBinding SelectionBoxItem}' ContentTemplate='{TemplateBinding SelectionBoxItemTemplate}' Margin='11,9,34,9' IsHitTestVisible='False' VerticalAlignment='Center'/><Popup x:Name='PART_Popup' IsOpen='{TemplateBinding IsDropDownOpen}' Placement='Bottom' AllowsTransparency='True' PopupAnimation='Fade'><Border Background='White' BorderBrush='#DED2E9' BorderThickness='1' CornerRadius='11' Padding='5' MinWidth='{Binding ActualWidth,RelativeSource={RelativeSource TemplatedParent}}'><ScrollViewer MaxHeight='220'><ItemsPresenter KeyboardNavigation.DirectionalNavigation='Contained'/></ScrollViewer></Border></Popup></Grid><ControlTemplate.Triggers><Trigger Property='IsEnabled' Value='False'><Setter Property='Opacity' Value='0.5'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type ComboBoxItem}'><Setter Property='Padding' Value='10,7'/><Setter Property='Foreground' Value='#44384E'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type ComboBoxItem}'><Border x:Name='item' Padding='{TemplateBinding Padding}' CornerRadius='7' Background='Transparent'><ContentPresenter/></Border><ControlTemplate.Triggers><Trigger Property='IsHighlighted' Value='True'><Setter TargetName='item' Property='Background' Value='#F0E8F8'/></Trigger><Trigger Property='IsSelected' Value='True'><Setter TargetName='item' Property='Background' Value='#ECE2F8'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type CheckBox}'><Setter Property='Foreground' Value='#4D4058'/><Setter Property='FontSize' Value='13'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type CheckBox}'><Grid Background='Transparent'><Grid.ColumnDefinitions><ColumnDefinition Width='36'/><ColumnDefinition Width='*'/></Grid.ColumnDefinitions><Border x:Name='track' Width='34' Height='20' CornerRadius='10' Background='#DAD2E1' VerticalAlignment='Center'><Ellipse x:Name='thumb' Width='14' Height='14' Fill='White' HorizontalAlignment='Left' Margin='3'/></Border><ContentPresenter Grid.Column='1' Margin='10,2,0,2' VerticalAlignment='Center' RecognizesAccessKey='True'/></Grid><ControlTemplate.Triggers><Trigger Property='IsChecked' Value='True'><Setter TargetName='track' Property='Background' Value='#8866AC'/><Setter TargetName='thumb' Property='HorizontalAlignment' Value='Right'/></Trigger><Trigger Property='IsKeyboardFocused' Value='True'><Setter TargetName='track' Property='BorderBrush' Value='#493456'/><Setter TargetName='track' Property='BorderThickness' Value='1.5'/></Trigger><Trigger Property='IsEnabled' Value='False'><Setter Property='Opacity' Value='0.45'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type Slider}'><Setter Property='Margin' Value='0,7,0,9'/><Setter Property='MinHeight' Value='26'/><Setter Property='Template'><Setter.Value><ControlTemplate TargetType='{x:Type Slider}'><Border x:Name='focus' BorderThickness='1' BorderBrush='Transparent' CornerRadius='9' Padding='2'><Grid Background='Transparent'><Border Height='4' CornerRadius='2' Background='#E5DDEC' VerticalAlignment='Center'/><Track x:Name='PART_Track' Minimum='{TemplateBinding Minimum}' Maximum='{TemplateBinding Maximum}' Value='{Binding Value,RelativeSource={RelativeSource TemplatedParent},Mode=TwoWay}' Orientation='{TemplateBinding Orientation}' IsDirectionReversed='{TemplateBinding IsDirectionReversed}'><Track.DecreaseRepeatButton><RepeatButton Command='Slider.DecreaseLarge' Focusable='False' Background='#AA8CC8'><RepeatButton.Template><ControlTemplate TargetType='{x:Type RepeatButton}'><Border Height='4' CornerRadius='2' Background='{TemplateBinding Background}' VerticalAlignment='Center'/></ControlTemplate></RepeatButton.Template></RepeatButton></Track.DecreaseRepeatButton><Track.Thumb><Thumb Width='19' Height='19' Focusable='False'><Thumb.Template><ControlTemplate TargetType='{x:Type Thumb}'><Ellipse Fill='#8866AC' Stroke='White' StrokeThickness='3'/></ControlTemplate></Thumb.Template></Thumb></Track.Thumb><Track.IncreaseRepeatButton><RepeatButton Command='Slider.IncreaseLarge' Focusable='False' Background='Transparent'><RepeatButton.Template><ControlTemplate TargetType='{x:Type RepeatButton}'><Border Height='4' Background='{TemplateBinding Background}' VerticalAlignment='Center'/></ControlTemplate></RepeatButton.Template></RepeatButton></Track.IncreaseRepeatButton></Track></Grid></Border><ControlTemplate.Triggers><Trigger Property='IsKeyboardFocused' Value='True'><Setter TargetName='focus' Property='BorderBrush' Value='#9271B5'/></Trigger><Trigger Property='IsEnabled' Value='False'><Setter Property='Opacity' Value='0.5'/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>


<Style TargetType='{x:Type DatePicker}'><Setter Property='Background' Value='White'/><Setter Property='Foreground' Value='#44384E'/><Setter Property='BorderBrush' Value='#E3DAEA'/><Setter Property='Padding' Value='6'/><Setter Property='FontSize' Value='13'/></Style>


</ResourceDictionary>";


        public static void Apply(Window window){window.Resources.MergedDictionaries.Add((ResourceDictionary)XamlReader.Parse(Resources));window.FontFamily=new FontFamily("Segoe UI");window.FontSize=13;window.Foreground=Ink;window.UseLayoutRounding=true;TextOptions.SetTextFormattingMode(window,TextFormattingMode.Display);}


        public static Button Button(string label,Action action,bool primary){var b=new Button{Content=label,Padding=new Thickness(13,9,13,9),Margin=new Thickness(0,0,0,0)};if(primary){b.Background=Purple;b.Foreground=Brushes.White;b.BorderBrush=Purple;}System.Windows.Automation.AutomationProperties.SetName(b,label);b.Click+=delegate{action();};return b;}


        public static FrameworkElement Icon(string kind,Brush color,double size){string path=kind=="heart"?"M12,21 C-4,10 2,0 12,7 C22,0 28,10 12,21 Z":kind=="feed"?"M2,11 L22,11 C21,22 3,22 2,11 Z M6,7 L6,4 M12,6 L12,2 M18,7 L18,4":kind=="play"?"M7,3 L21,12 L7,21 Z":kind=="clock"?"M12,2 A10,10 0 1 1 11.9,2 M12,6 L12,12 L17,15":kind=="settings"?"M5,6 L21,6 M5,12 L21,12 M5,18 L21,18 M8,3 L8,9 M16,9 L16,15 M10,15 L10,21":kind=="close"?"M5,5 L19,19 M19,5 L5,19":kind=="moon"?"M16,2 C2,4 2,19 15,22 C19,22 22,19 23,16 C13,20 9,9 16,2 Z":"M4,12 L20,12 M14,6 L20,12 L14,18";var shape=new System.Windows.Shapes.Path{Data=Geometry.Parse(path),Stroke=color,StrokeThickness=1.6,StrokeStartLineCap=PenLineCap.Round,StrokeEndLineCap=PenLineCap.Round,StrokeLineJoin=PenLineJoin.Round,Stretch=Stretch.Uniform};return new Viewbox{Child=shape,Width=size,Height=size};}


        public static TextBlock Text(string value,double size,Brush color,bool strong){return new TextBlock{Text=value,FontSize=size,Foreground=color,FontWeight=strong?FontWeights.SemiBold:FontWeights.Normal,TextWrapping=TextWrapping.Wrap};}


        public static Border Card(UIElement child){return new Border{CornerRadius=new CornerRadius(16),BorderBrush=Line,BorderThickness=new Thickness(1),Background=Brushes.White,Padding=new Thickness(13),Child=child};}


    }


    public sealed class CompanionPanel : Window {


        public bool ReturnFocusToCat {get;private set;}


        bool closing;readonly CompanionWindow companion;readonly StackPanel body=new StackPanel();TextBlock status;


        public CompanionPanel(CompanionWindow owner){companion=owner;Owner=owner;Title="Mochi companion panel";Width=340;SizeToContent=SizeToContent.Height;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;ResizeMode=ResizeMode.NoResize;ShowInTaskbar=true;Topmost=owner.Topmost;MochiTheme.Apply(this);


            var border=new Border{CornerRadius=new CornerRadius(23),Background=MochiTheme.Cream,BorderBrush=MochiTheme.Line,BorderThickness=new Thickness(1),Padding=new Thickness(20),Effect=new DropShadowEffect{BlurRadius=24,ShadowDepth=5,Opacity=.12,Color=Colors.Black}};


            border.Child=new ScrollViewer{Content=body,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};Content=border;


            Build();Loaded+=delegate{Anchor();};PreviewKeyDown+=delegate(object s,KeyEventArgs e){if(e.Key==Key.Escape){Close();e.Handled=true;}};


            Closing+=delegate{ReturnFocusToCat=IsActive;closing=true;};Deactivated+=delegate{if(!closing)Dispatcher.BeginInvoke(new Action(delegate{if(!closing&&IsVisible&&!IsActive&&!IsMouseOver)Close();}));};


        }


        void Build(){


            var header=new Grid{Margin=new Thickness(0,0,0,15)};header.ColumnDefinitions.Add(new ColumnDefinition());header.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});var identity=new StackPanel();identity.Children.Add(MochiTheme.Text("Mochi",25,MochiTheme.Ink,true));identity.Children.Add(MochiTheme.Text(companion.ArtworkReady?(companion.ArtworkComplete?companion.SpeciesName+" / desktop companion":companion.SpeciesName+" / sprite preview"):"Local preview - artwork unavailable",11,MochiTheme.Muted,false));header.Children.Add(identity);var close=MochiTheme.Button("Close companion panel",Close,false);close.Content=MochiTheme.Icon("close",MochiTheme.Muted,14);close.Width=32;close.Height=32;close.Padding=new Thickness(8);close.Background=Brushes.Transparent;close.BorderThickness=new Thickness(0);Grid.SetColumn(close,1);header.Children.Add(close);body.Children.Add(header);


            var quick=new UniformGrid{Columns=3,Margin=new Thickness(0,0,0,15)};quick.Children.Add(Quick("Pet","heart",delegate{React("happy");}));quick.Children.Add(Quick("Feed","feed",delegate{React("feed");}));quick.Children.Add(Quick("Play","play",delegate{React("play");}));body.Children.Add(quick);


            var extras=new UniformGrid{Columns=2,Margin=new Thickness(0,0,0,15)};var tail=MochiTheme.Button("Tail swish",delegate{React("groom");},false);tail.Margin=new Thickness(0,0,4,0);extras.Children.Add(tail);var surprise=MochiTheme.Button("Surprise me",delegate{if(companion.State.Settings.Paused){status.Text="Turn off Rest animations to play together.";return;}Close();companion.SurpriseMe();},false);surprise.Margin=new Thickness(4,0,0,0);surprise.IsEnabled=companion.HasExtraActions;surprise.ToolTip="A random authentic animation from this character's source sheet";extras.Children.Add(surprise);body.Children.Add(extras);


            body.Children.Add(MochiTheme.Text("A little help, whenever you need it",12,MochiTheme.Muted,true));


            var commandRow=new Grid{Margin=new Thickness(0,8,0,7)};commandRow.ColumnDefinitions.Add(new ColumnDefinition());commandRow.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(44)});var input=new TextBox{MaxLength=3000,ToolTip="Try: play Mercy, open GitHub, remind me in 10 minutes to stretch"};System.Windows.Automation.AutomationProperties.SetName(input,"Command");commandRow.Children.Add(input);Action run=delegate{status.Text=companion.ExecuteCommand(input.Text);};var send=MochiTheme.Button("Run command",run,true);send.Content=MochiTheme.Icon("arrow",Brushes.White,16);send.Margin=new Thickness(6,0,0,0);send.Padding=new Thickness(10);Grid.SetColumn(send,1);commandRow.Children.Add(send);input.KeyDown+=delegate(object s,KeyEventArgs e){if(e.Key==Key.Enter){run();e.Handled=true;}};body.Children.Add(commandRow);


            status=MochiTheme.Text("Try \"open GitHub\" or \"remind me in 10 minutes to stretch\".",11,MochiTheme.Muted,false);status.Margin=new Thickness(0,0,0,14);body.Children.Add(status);


            var next=companion.State.Reminders.Where(r=>!r.Completed&&!r.Paused).OrderBy(r=>r.DueUtcTicks).FirstOrDefault();var reminder=new StackPanel();reminder.Children.Add(MochiTheme.Text("UP NEXT",9,MochiTheme.Purple,true));reminder.Children.Add(MochiTheme.Text(next==null?"A little room for what matters":next.Title,13,MochiTheme.Ink,true));reminder.Children.Add(MochiTheme.Text(next==null?"Add a reminder and leave the rest to Mochi.":new DateTime(next.DueUtcTicks,DateTimeKind.Utc).ToLocalTime().ToString("ddd, HH:mm"),11,MochiTheme.Muted,false));var add=MochiTheme.Button("Add a reminder",delegate{Close();companion.AddReminder();},false);add.Margin=new Thickness(0,9,0,0);reminder.Children.Add(add);body.Children.Add(MochiTheme.Card(reminder));


            var toggles=new StackPanel{Margin=new Thickness(0,14,0,7)};toggles.Children.Add(Toggle("Roam freely",companion.State.Settings.Roaming,delegate(bool v){companion.State.Settings.Roaming=v;companion.ApplyPreferences();}));toggles.Children.Add(Toggle("Little playful surprises",companion.State.Settings.PlayfulActions,delegate(bool v){companion.State.Settings.PlayfulActions=v;companion.ApplyPreferences();}));toggles.Children.Add(Toggle("Rest animations",companion.State.Settings.Paused,delegate(bool v){companion.State.Settings.Paused=v;companion.ApplyPreferences();}));body.Children.Add(toggles);


            var tools=new Grid{Margin=new Thickness(0,0,0,12)};tools.ColumnDefinitions.Add(new ColumnDefinition());tools.ColumnDefinitions.Add(new ColumnDefinition());var reminders=MochiTheme.Button("Reminders",delegate{Close();companion.OpenReminders();},false);reminders.Margin=new Thickness(0,0,4,0);tools.Children.Add(reminders);var appearance=MochiTheme.Button("Appearance",delegate{Close();companion.OpenSettings();},false);appearance.Margin=new Thickness(4,0,0,0);Grid.SetColumn(appearance,1);tools.Children.Add(appearance);body.Children.Add(tools);


            var media=MochiTheme.Button("Music · active players",delegate{Close();companion.OpenMedia();},false);media.HorizontalAlignment=HorizontalAlignment.Stretch;media.Margin=new Thickness(0,0,0,12);body.Children.Add(media);


            var google=MochiTheme.Button("Google / connections",delegate{Close();companion.OpenGoogleConnections();},false);google.HorizontalAlignment=HorizontalAlignment.Stretch;google.Margin=new Thickness(0,0,0,12);body.Children.Add(google);
            var footer=new Grid();footer.ColumnDefinitions.Add(new ColumnDefinition());footer.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});footer.ColumnDefinitions.Add(new ColumnDefinition{Width=GridLength.Auto});var quiet=MochiTheme.Text(!companion.State.Settings.RemindersEnabled?"Reminders paused":ReminderEngine.IsQuiet(companion.State.Settings,DateTime.Now)?"Quiet hours":"Locally yours",10,MochiTheme.Muted,false);quiet.VerticalAlignment=VerticalAlignment.Center;footer.Children.Add(quiet);var hide=MochiTheme.Button("Hide Mochi",delegate{Close();companion.HideCompanion();},false);hide.Content=MochiTheme.Icon("moon",MochiTheme.Muted,16);hide.Width=35;hide.Padding=new Thickness(8);hide.Margin=new Thickness(5,0,5,0);Grid.SetColumn(hide,1);footer.Children.Add(hide);var quit=MochiTheme.Button("Quit",delegate{companion.Quit();},false);quit.Foreground=MochiTheme.Danger;quit.Background=MochiTheme.ColorBrush("#FFF1F3");quit.BorderBrush=MochiTheme.ColorBrush("#EED9DF");Grid.SetColumn(quit,2);footer.Children.Add(quit);body.Children.Add(footer);


        }


        Button Quick(string label,string icon,Action action){var b=MochiTheme.Button(label,action,false);b.Margin=new Thickness(0,0,label=="Play"?0:7,0);b.Height=69;b.Padding=new Thickness(8);b.BorderThickness=new Thickness(0);b.Background=MochiTheme.ColorBrush(label=="Feed"?"#F2ECDD":label=="Play"?"#E7F0E8":"#EFE4F7");var stack=new StackPanel{HorizontalAlignment=HorizontalAlignment.Center};stack.Children.Add(MochiTheme.Icon(icon,MochiTheme.Purple,22));var text=MochiTheme.Text(label,12,MochiTheme.Ink,true);text.Margin=new Thickness(0,5,0,0);text.TextAlignment=TextAlignment.Center;stack.Children.Add(text);b.Content=stack;return b;}


        CheckBox Toggle(string label,bool value,Action<bool> change){var box=new CheckBox{Content=label,IsChecked=value,Margin=new Thickness(0,5,0,5)};System.Windows.Automation.AutomationProperties.SetName(box,label);box.Click+=delegate{change(box.IsChecked==true);};return box;}


        void React(string action){if(companion.State.Settings.Paused){status.Text="Mochi is resting. Turn off Rest animations to play together.";return;}Close();companion.AnimatePose(action,0);}


        void Anchor(){var cat=companion.GetDesktopBounds();var area=Forms.Screen.FromRectangle(cat).WorkingArea;double dpi=1;var source=PresentationSource.FromVisual(companion);if(source!=null&&source.CompositionTarget!=null)dpi=source.CompositionTarget.TransformToDevice.M11;MaxHeight=Math.Max(280,area.Height/dpi-24);double desiredX=cat.Right/dpi+14;if(desiredX+Width>area.Right/dpi-12)desiredX=cat.Left/dpi-Width-14;Left=Math.Max(area.Left/dpi+12,Math.Min(area.Right/dpi-Width-12,desiredX));Top=Math.Max(area.Top/dpi+12,Math.Min(area.Bottom/dpi-ActualHeight-12,cat.Top/dpi-30));}


    }


}



// Native character selection and bundled attribution. No remote art is loaded at runtime.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
namespace MochiDesktop {
    public sealed class SpeciesPicker : UniformGrid {
        readonly Dictionary<string,RadioButton> choices=new Dictionary<string,RadioButton>();
        public string SelectedSpecies {get {var choice=choices.FirstOrDefault(p=>p.Value.IsChecked==true);return choice.Key??"eevee";}}
        public SpeciesPicker(string selected){
            Columns=3;Margin=new Thickness(-3,1,-3,3);string group="species-"+Guid.NewGuid().ToString("N");
            foreach(string species in PetTimeline.Species){
                var radio=new RadioButton{GroupName=group,IsChecked=species==selected,Margin=new Thickness(3),Padding=new Thickness(6),HorizontalContentAlignment=HorizontalAlignment.Center,VerticalContentAlignment=VerticalAlignment.Center,Cursor=System.Windows.Input.Cursors.Hand};
                AutomationProperties.SetName(radio,PetTimeline.SpeciesName(species));radio.ToolTip=PetTimeline.SpeciesName(species);
                var template=new ControlTemplate(typeof(RadioButton));var border=new FrameworkElementFactory(typeof(Border));border.Name="tile";border.SetValue(Border.BackgroundProperty,MochiTheme.ColorBrush("#FAF6FC"));border.SetValue(Border.BorderBrushProperty,MochiTheme.Line);border.SetValue(Border.BorderThicknessProperty,new Thickness(1));border.SetValue(Border.CornerRadiusProperty,new CornerRadius(12));border.SetValue(Border.PaddingProperty,new Thickness(6));var presenter=new FrameworkElementFactory(typeof(ContentPresenter));presenter.SetValue(FrameworkElement.HorizontalAlignmentProperty,HorizontalAlignment.Center);border.AppendChild(presenter);template.VisualTree=border;
                var checkedTrigger=new Trigger{Property=ToggleButton.IsCheckedProperty,Value=true};checkedTrigger.Setters.Add(new Setter(Border.BackgroundProperty,MochiTheme.Lavender,"tile"));checkedTrigger.Setters.Add(new Setter(Border.BorderBrushProperty,MochiTheme.Purple,"tile"));checkedTrigger.Setters.Add(new Setter(Border.BorderThicknessProperty,new Thickness(2),"tile"));template.Triggers.Add(checkedTrigger);
                var focusTrigger=new Trigger{Property=UIElement.IsKeyboardFocusedProperty,Value=true};focusTrigger.Setters.Add(new Setter(Border.BorderBrushProperty,MochiTheme.Ink,"tile"));template.Triggers.Add(focusTrigger);radio.Template=template;
                var content=new StackPanel();string poster=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","mochi","posters",species+".png");
                if(File.Exists(poster)){try{var bitmap=new BitmapImage();bitmap.BeginInit();bitmap.CacheOption=BitmapCacheOption.OnLoad;bitmap.UriSource=new Uri(poster,UriKind.Absolute);bitmap.EndInit();bitmap.Freeze();var image=new Image{Source=SpritePixels.TrimmedPoster(bitmap),Width=62,Height=55,Stretch=Stretch.Uniform,IsHitTestVisible=false};RenderOptions.SetBitmapScalingMode(image,BitmapScalingMode.NearestNeighbor);content.Children.Add(image);}catch{}}
                var label=MochiTheme.Text(PetTimeline.SpeciesName(species),11,MochiTheme.Ink,true);label.HorizontalAlignment=HorizontalAlignment.Center;content.Children.Add(label);radio.Content=content;choices.Add(species,radio);Children.Add(radio);
            }
            if(!PetTimeline.Species.Contains(selected))choices["eevee"].IsChecked=true;
        }
    }
    public sealed class CreditsWindow : MochiDialog {
        public CreditsWindow(CompanionWindow owner):base(owner,"Mochi - sprite credits",600){
            Heading("Made possible by sprite artists");Note("Mochi "+typeof(CompanionWindow).Assembly.GetName().Version.ToString());Note("These character sprites retain their source credits and separate artwork terms. Mochi's application source license does not replace those terms.");
            string root=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","mochi"),credits=Path.Combine(root,"CREDITS.md");
            string text="Sprite credits are unavailable in this development preview. A release requires the complete credited asset folder.";
            if(File.Exists(credits)&&new FileInfo(credits).Length<=500000)try{text=File.ReadAllText(credits);}catch{}
            var display=new TextBox{Text=text,IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=300,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};AutomationProperties.SetName(display,"Bundled sprite artist credits");Panel.Children.Add(display);Note("The complete assets folder also includes LICENSE-SpriteCollab.md and SOURCE.json.");
        }
    }
}

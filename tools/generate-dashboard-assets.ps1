$code = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class DashboardAssets {
    static GraphicsPath Rounded(float x, float y, float width, float height, float radius) {
        var path = new GraphicsPath();
        float d = radius * 2;
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + width - d, y, d, d, 270, 90);
        path.AddArc(x + width - d, y + height - d, d, d, 0, 90);
        path.AddArc(x, y + height - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
    static Color ColorOf(string value) { return ColorTranslator.FromHtml(value); }
    static void Panel(Graphics g, float x, float y, float width, float height, float radius, Color top, Color bottom, Color border) {
        using (var path = Rounded(x, y, width, height, radius))
        using (var fill = new LinearGradientBrush(new PointF(x, y), new PointF(x + width, y + height), top, bottom))
        using (var pen = new Pen(border, 0.7f)) {
            g.FillPath(fill, path);
            g.DrawPath(pen, path);
        }
    }
    static void SaveFrame(Bitmap image, Graphics g, string file) {
        const int capHeight = 28;
        int bottom = image.Height - capHeight;
        using (var middle = image.Clone(new Rectangle(0, capHeight, image.Width, bottom - capHeight), image.PixelFormat))
        using (var cap = image.Clone(new Rectangle(0, bottom, image.Width, capHeight), image.PixelFormat)) {
            middle.Save(file + "-middle.png", ImageFormat.Png);
            cap.Save(file + "-bottom.png", ImageFormat.Png);
        }
        g.CompositingMode = CompositingMode.SourceCopy;
        using (var clear = new SolidBrush(Color.Transparent)) {
            g.FillRectangle(clear, 0, capHeight, image.Width, image.Height - capHeight);
        }
        g.CompositingMode = CompositingMode.SourceOver;
        image.Save(file + ".png", ImageFormat.Png);
    }
    public static void Generate(string dir) {
        using (var image = new Bitmap(516, 318, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(image)) {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var top = ColorOf("#223b58");
            var bottom = ColorOf("#14283d");
            var panelTop = ColorOf("#24425d");
            var panelBottom = ColorOf("#1b344d");
            var border = ColorOf("#6b86a4");
            Panel(g, 3.5f, 3.5f, 509, 311, 23, top, bottom, border);
            SaveFrame(image, g, Path.Combine(dir, "background-night-dashboard"));
            g.Clear(Color.Transparent);
            var panelBorder = Color.FromArgb(70, border);
            Panel(g, 8.5f, 39.5f, 273, 103, 9, panelTop, panelBottom, panelBorder);
            Panel(g, 287.5f, 39.5f, 220, 103, 9, panelTop, panelBottom, panelBorder);
            using (var separator = new Pen(Color.FromArgb(65, border), 0.7f)) {
                g.DrawLine(separator, 360, 56, 360, 129);
                g.DrawLine(separator, 434, 56, 434, 129);
            }
            int metricX = 8;
            int[] metricWidths = { 91, 89, 100, 95, 109 };
            foreach (int width in metricWidths) {
                Panel(g, metricX + 0.5f, 161.5f, width - 1, 41, 7, panelTop, panelBottom, panelBorder);
                metricX += width + 4;
            }
            Panel(g, 8.5f, 230.5f, 499, 78, 9, panelTop, panelBottom, panelBorder);
            using (var separator = new Pen(Color.FromArgb(60, border), 0.7f)) {
                for (int i = 1; i < 8; i++) { g.DrawLine(separator, 10 + 62 * i, 237, 10 + 62 * i, 306); }
            }
            image.Save(Path.Combine(dir, "panels-night-dashboard.png"), ImageFormat.Png);
        }
    }
}
'@
Add-Type -ReferencedAssemblies System.Drawing $code
[DashboardAssets]::Generate((Resolve-Path (Join-Path $PSScriptRoot '..\src')).Path)

# dmgbuild settings for Seaman installer
import os

application = defines['app']
appname = os.path.basename(application)

files = [application]
symlinks = {'Applications': '/Applications'}

background = defines['bg']

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False

window_rect = ((200, 120), (800, 500))
default_view = 'icon-view'
icon_size = 120
text_size = 14

hide = ['.background.tiff', '.background.png', '.fseventsd']

# icon center coordinates (dmgbuild uses center, not top-left)
# hidden system files pushed far off-screen so they don't show even with "Show Hidden Files"
icon_locations = {
    appname:            (185, 210),
    'Applications':     (590, 210),
    '.background.tiff': (1200, 1200),
    '.background.png':  (1200, 1400),
    '.fseventsd':       (1200, 1600),
}

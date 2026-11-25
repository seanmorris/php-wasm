#!/usr/bin/env python3

import hashlib
import os
import shutil
import subprocess
import sys

VERSION = '2.32.10'
TAG = f'release-{VERSION}'
HASH = '001738b610b42a8f8badfd6af3402f0a1a8601034adef0b8c702dd2b1951dc1b71b733a6779d97499b6f7314d226ec0c8dcffeb753f35a5c51e995ca20bdd459'
SUBDIR = f'SDL-{TAG}'
PATCH = os.path.join(os.path.dirname(__file__), '..', 'patches', 'SDL2-rumble.patch')


def content_id():
  digest = hashlib.sha256()
  for path in (__file__, PATCH):
    with open(path, 'rb') as source:
      digest.update(source.read())
  return digest.hexdigest()[:16]


CONTENT_ID = content_id()
PROJECT = f'sdl2-rumble-{CONTENT_ID}'
variants = {'sdl2-rumble-mt': {'PTHREADS': 1}}


def get_lib_name(settings):
  suffix = '-mt' if settings.PTHREADS else ''
  return f'libSDL2-rumble-{CONTENT_ID}{suffix}.a'


def needed(settings):
  return False


def process_dependencies(settings, cflags_only):
  if not cflags_only:
    settings.EXPORTED_RUNTIME_METHODS.append('createContext')
    settings.GL_ENABLE_GET_PROC_ADDRESS = 1


def patched_source(ports):
  source = ports.get_dir(PROJECT, SUBDIR)
  patched = os.path.join(ports.get_dir(), f'{PROJECT}-patched', SUBDIR)
  marker = os.path.join(patched, '.php-wasm-rumble-patch')
  if not os.path.exists(marker):
    shutil.rmtree(os.path.dirname(patched), ignore_errors=True)
    shutil.copytree(source, patched)
    subprocess.check_call(['patch', '--batch', '-p1', '-i', PATCH], cwd=patched)
    with open(marker, 'w', encoding='utf-8') as output:
      output.write(CONTENT_ID + '\n')
  return patched


def get(ports, settings, shared):
  ports.fetch_port_artifact(
    PROJECT,
    f'https://github.com/libsdl-org/SDL/archive/{TAG}.zip',
    sha512hash=HASH,
  )

  def create(final):
    from tools import cache

    src_dir = patched_source(ports)
    ports.install_headers(os.path.join(src_dir, 'include'), target='SDL2')
    os.makedirs(cache.get_sysroot_dir('lib', 'pkgconfig'), exist_ok=True)
    ports.make_pkg_config('sdl2', VERSION, '-sUSE_SDL=2')

    srcs = '''SDL.c SDL_assert.c SDL_dataqueue.c SDL_error.c SDL_guid.c SDL_hints.c SDL_list.c SDL_log.c
    SDL_utils.c atomic/SDL_atomic.c atomic/SDL_spinlock.c audio/SDL_audio.c audio/SDL_audiocvt.c
    audio/SDL_audiodev.c audio/SDL_audiotypecvt.c audio/SDL_mixer.c audio/SDL_wave.c cpuinfo/SDL_cpuinfo.c
    dynapi/SDL_dynapi.c events/SDL_clipboardevents.c events/SDL_displayevents.c events/SDL_dropevents.c
    events/SDL_events.c events/SDL_gesture.c events/SDL_keyboard.c events/SDL_keysym_to_scancode.c
    events/SDL_scancode_tables.c events/SDL_mouse.c events/SDL_quit.c events/SDL_touch.c events/SDL_windowevents.c
    file/SDL_rwops.c haptic/SDL_haptic.c hidapi/SDL_hidapi.c joystick/controller_type.c
    joystick/SDL_gamecontroller.c joystick/SDL_joystick.c joystick/SDL_steam_virtual_gamepad.c power/SDL_power.c
    render/SDL_d3dmath.c render/SDL_render.c render/SDL_yuv_sw.c render/direct3d/SDL_render_d3d.c
    render/direct3d11/SDL_render_d3d11.c render/opengl/SDL_render_gl.c render/opengl/SDL_shaders_gl.c
    render/opengles/SDL_render_gles.c render/opengles2/SDL_render_gles2.c render/opengles2/SDL_shaders_gles2.c
    render/psp/SDL_render_psp.c render/software/SDL_blendfillrect.c render/software/SDL_blendline.c
    render/software/SDL_blendpoint.c render/software/SDL_drawline.c render/software/SDL_drawpoint.c
    render/software/SDL_render_sw.c render/software/SDL_rotate.c render/software/SDL_triangle.c sensor/SDL_sensor.c
    sensor/dummy/SDL_dummysensor.c stdlib/SDL_crc16.c stdlib/SDL_crc32.c stdlib/SDL_getenv.c stdlib/SDL_iconv.c
    stdlib/SDL_malloc.c stdlib/SDL_qsort.c stdlib/SDL_stdlib.c stdlib/SDL_string.c stdlib/SDL_strtokr.c
    thread/SDL_thread.c timer/SDL_timer.c video/SDL_RLEaccel.c video/SDL_blit.c video/SDL_blit_0.c
    video/SDL_blit_1.c video/SDL_blit_A.c video/SDL_blit_N.c video/SDL_blit_auto.c video/SDL_blit_copy.c
    video/SDL_blit_slow.c video/SDL_bmp.c video/SDL_clipboard.c video/SDL_egl.c video/SDL_fillrect.c
    video/SDL_pixels.c video/SDL_rect.c video/SDL_shape.c video/SDL_stretch.c video/SDL_surface.c video/SDL_video.c
    video/SDL_yuv.c video/emscripten/SDL_emscriptenevents.c video/emscripten/SDL_emscriptenframebuffer.c
    video/emscripten/SDL_emscriptenmouse.c video/emscripten/SDL_emscriptenopengles.c
    video/emscripten/SDL_emscriptenvideo.c audio/emscripten/SDL_emscriptenaudio.c video/dummy/SDL_nullevents.c
    video/dummy/SDL_nullframebuffer.c video/dummy/SDL_nullvideo.c video/yuv2rgb/yuv_rgb_std.c
    audio/disk/SDL_diskaudio.c audio/dummy/SDL_dummyaudio.c loadso/dlopen/SDL_sysloadso.c
    power/emscripten/SDL_syspower.c joystick/emscripten/SDL_sysjoystick.c
    filesystem/emscripten/SDL_sysfilesystem.c timer/unix/SDL_systimer.c haptic/dummy/SDL_syshaptic.c
    main/dummy/SDL_dummy_main.c locale/SDL_locale.c locale/emscripten/SDL_syslocale.c misc/SDL_url.c
    misc/emscripten/SDL_sysurl.c'''.split()
    thread_srcs = ['SDL_syscond.c', 'SDL_sysmutex.c', 'SDL_syssem.c', 'SDL_systhread.c', 'SDL_systls.c']
    thread_backend = 'pthread' if settings.PTHREADS else 'generic'
    srcs += [f'thread/{thread_backend}/{name}' for name in thread_srcs]
    srcs = [os.path.join(src_dir, 'src', name) for name in srcs]
    flags = ['-sUSE_SDL=0', '-fwrapv-pointer']
    if settings.PTHREADS:
      flags.append('-pthread')
    ports.build_port(
      src_dir,
      final,
      PROJECT,
      srcs=srcs,
      includes=[ports.get_include_dir('SDL2')],
      flags=flags,
    )

  return [shared.cache.get_lib(get_lib_name(settings), create, what='port')]


def clear(ports, settings, shared):
  shared.cache.erase_lib(get_lib_name(settings))


def process_args(ports):
  return ['-isystem', ports.get_include_dir('SDL2')]


def show():
  return 'SDL 2.32.10 with the php-wasm browser rumble backport (zlib license)'


if __name__ == '__main__' and sys.argv[1:] == ['--print-library']:
  print(f'libSDL2-rumble-{CONTENT_ID}.a')

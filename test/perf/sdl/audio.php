<?php

function audioCheck(bool $condition): void
{
	if(!$condition) { throw new RuntimeException(SDL_GetError() ?: 'Mixer state mismatch'); }
}

audioCheck(SDL_Init(SDL_INIT_AUDIO) === 0);
audioCheck(Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 1024) === 0);
audioCheck(Mix_AllocateChannels(32) === 32);
Mix_Volume(-1, 4);
Mix_VolumeMusic(16);

// A quiet, periodic stereo tone makes the actual summed PCM independently
// checkable without clipping. File generation and decoding precede timing.
$pcm = '';
for($frame = 0; $frame < 4410; $frame++)
{
	$sample = (int)round(4096 * sin(2 * M_PI * 440 * $frame / 44100)) & 0xffff;
	$pcm .= pack('v2', $sample, $sample);
}
$wav = 'RIFF'.pack('V', 36 + strlen($pcm)).'WAVEfmt '
	.pack('VvvVVvv', 16, 1, 2, 44100, 176400, 4, 16)
	.'data'.pack('V', strlen($pcm)).$pcm;
file_put_contents('/mixer-tone.wav', $wav);
$chunk = Mix_LoadWAV('/mixer-tone.wav');
$music = Mix_LoadMUS('/preload/sdl/WOJTEK3.mp3');
audioCheck((bool)$chunk && (bool)$music);
unset($pcm, $wav, $sample);

function audioState(int $channels, bool $playingMusic): array
{
	audioCheck(Mix_Playing(-1) === $channels);
	audioCheck((bool)Mix_PlayingMusic() === $playingMusic);
	audioCheck(Mix_QuerySpec($frequency, $format, $outputs) === 1);
	return compact('channels', 'playingMusic', 'frequency', 'format', 'outputs');
}

function audioStart(int $channels, bool $playingMusic): array
{
	global $chunk, $music;
	Mix_HaltChannel(-1);
	Mix_HaltMusic();
	for($channel = 0; $channel < $channels; $channel++)
	{
		audioCheck(Mix_PlayChannel($channel, $chunk, -1) === $channel);
	}
	if($playingMusic) { audioCheck(Mix_PlayMusic($music, -1) === 0); }
	return audioState($channels, $playingMusic);
}

function audioCleanup(): void
{
	global $chunk, $music;
	Mix_HaltChannel(-1); Mix_HaltMusic();
	Mix_FreeChunk($chunk); Mix_FreeMusic($music);
	Mix_CloseAudio(); Mix_Quit(); SDL_Quit();
	unset($chunk, $music);
}

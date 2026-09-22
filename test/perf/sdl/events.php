<?php

perfCheck(SDL_Init(SDL_INIT_EVENTS) === 0, SDL_GetError());
$input = new SDL_Event;
$input->type = SDL_MOUSEMOTION;
$input->motion = (object)['x'=>123, 'y'=>456, 'xrel'=>-7, 'yrel'=>9, 'state'=>1];
$output = new SDL_Event;
$expected = ['x'=>123, 'y'=>456, 'xrel'=>-7, 'yrel'=>9, 'state'=>1];
foreach([32, 1024] as $burst)
{
	$cases['burst_' . $burst] = [
		'batches' => intdiv(32768, $burst), 'itemsPerBatch' => $burst
		, 'callsPerBatch' => 2*$burst+1, 'bytesPerBatch' => 0
		, 'prepare' => function() use ($output) { while(SDL_PollEvent($output)) {} }
		, 'submit' => function() use ($input, $output, $expected, $burst) {
			for($index = 0; $index < $burst; $index++)
			{
				if(SDL_PushEvent($input) !== 1) { throw new RuntimeException(SDL_GetError()); }
			}
			$received = 0;
			while(SDL_PollEvent($output))
			{
				perfCheck($output->type === SDL_MOUSEMOTION, 'Unexpected event in isolated queue');
				foreach($expected as $key => $value) { perfCheck($output->motion->$key === $value, 'Event payload changed'); }
				$received++;
			}
			perfCheck($received === $burst, 'Event burst lost events');
		}
		, 'finish' => function() {}, 'verify' => function() {}
	];
}
$cleanup = function() { SDL_Quit(); };

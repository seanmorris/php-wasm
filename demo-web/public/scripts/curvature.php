<?php // {"autorun":true, "persist":true, "single-expression": false, "render-as": "text"}
$window = new Vrzno;
$require = $window->require;
$Form = $require('curvature/form/Form')->Form;
$View = $require('curvature/base/View')->View;

$form = new $Form((object)[
    'id'   => (object)['type' => 'number'],
    'name' => (object)['type' => 'text'],
]);

$view = $View->from('<div style = "display:flex;flex-direction:row;margin:1rem;width:100%;">
	<div style = "margin-right:1rem">
		<p>Counter</p>
		<div style = "display:flex;flex-direction:row;margin:1rem auto;min-width:4rem;">
			<button cv-on = "click:dec" style = "flex:1">-</button>
			<button cv-on = "click:inc" style = "flex:1">+</button>
		</div>
		<div style = "font-size:6rem;">[[counter]]</div>
	</div>
	<div style = "margin-right:1rem">
		<p>Form: [[form]]</p>
		<p>PHP Serialized: [[serialized]]</p>
		<p>JSON: [[json]]</p>
	</div>
</div>');

$form->bindTo('json', function($json = NULL) use($view, $form) {
    $view->args->serialized = serialize((array) $form->args->value);
    $view->args->json = $json;
});

$view->args->counter = 0;
$view->args->form = $form;

$view->inc = fn() => $view->args->counter++;
$view->dec = fn() => $view->args->counter--;

$renderTo = $window->document->body->querySelector('#example');
$renderTo->innerHTML = '';
$view->render($renderTo);

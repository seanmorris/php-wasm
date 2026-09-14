<?php

declare(strict_types=1);

require '/preload/test_www/phpdbg-inspection-include.php';

const PHPDBG_INSPECTION_CONSTANT = 'constant-value';

interface PhpDbgInspectionContract
{
	public function getLabel(): string;
}

trait PhpDbgInspectionTrait
{
	public function getLabel(): string
	{
		return $this->label;
	}
}

final class PhpDbgInspectionClass implements PhpDbgInspectionContract
{
	use PhpDbgInspectionTrait;

	public const KIND = 'inspection-class';

	public function __construct(public string $label)
	{
	}
}

function phpdbg_inspection_inner(string $argument): string
{
	global $phpdbgInspectionGlobal;

	$localString = 'local-value';
	$localNumber = 42;
	$localBoolean = true;
	$localNull = null;
	$localArray = ['nested' => ['answer' => 42]];
	$localObject = new PhpDbgInspectionClass('object-value');
	$breakpointValue = $argument; // PHPDBG_INSPECTION_BREAKPOINT

	return implode(':', [
		$breakpointValue,
		$localString,
		(string) $localNumber,
		$localBoolean ? 'true' : 'false',
		$localNull === null ? 'null' : 'not-null',
		(string) $localArray['nested']['answer'],
		$localObject->getLabel(),
		$phpdbgInspectionGlobal,
	]);
}

function phpdbg_inspection_outer(): string
{
	$outerValue = 'outer-value';

	return phpdbg_inspection_inner($outerValue);
}

$phpdbgInspectionGlobal = 'global-value';
$inspectionResult = phpdbg_inspection_outer();

echo "inspection-complete:$inspectionResult\n";

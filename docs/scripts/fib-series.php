<?php

include('./fib.php');

function fibonacciSeries(int $num)
{
    $series = [];
    for ($i = 0; $i < $num; $i++) {
        array_push($series, fibonacci($i));
    }
    return $series;
}


print_r(fibonacciSeries(10));

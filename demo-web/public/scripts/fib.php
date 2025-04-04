<?php

function fibonacci(int $num)
{
    if ($num < 0) {
        throw new \Exception("Number must be greater than 0.");
    } else {
        if ($num == 0 || $num == 1) {
            return $num;
        } else {
            return fibonacci($num - 1) + fibonacci($num - 2);
        }
    }
}

#!/usr/bin/env php
<?php

$config = array(
    'WORLDSKILLS_API_ORGANIZATIONS' => 'https://api.worldskills.org/org',
);

$url = $config['WORLDSKILLS_API_ORGANIZATIONS'] . '/members?member_of=1&limit=75';
$response = file_get_contents($url);
$members = json_decode($response);

foreach ($members->members as $member)
{
    $memberCode = $member->code;
    $memberFlagUrl = $member->flag->links[1]->href . '_small';

    $flag = file_get_contents($memberFlagUrl);
    $filename = __DIR__ . '/../flags/' . $memberCode . '.png';

    file_put_contents($filename, $flag);

    echo ".";
}

echo "\n";

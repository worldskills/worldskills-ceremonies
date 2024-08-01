#!/usr/bin/env node

'use strict';

var fs = require('fs');
var XLSX = require('xlsx');

var skills = require(__dirname + '/../data/json/skills.json');
var skillsRu = require(__dirname + '/../data/json/skills-ru.json');
var members = require(__dirname + '/../data/json/members.json');

var workbook = XLSX.readFile(__dirname + '/../data/cis/Competitor_results.xlsx');
var worksheet = workbook.Sheets[workbook.SheetNames[0]];

var results = XLSX.utils.sheet_to_json(worksheet, {raw:false});

var workbook = XLSX.readFile(__dirname + '/../data/cis/Best_of_Nation.xlsx');
var worksheet = workbook.Sheets[workbook.SheetNames[0]];

var resultsBestOfNations = XLSX.utils.sheet_to_json(worksheet, {raw:false});

var maxResult = Math.max.apply(Math, results.map(function (result) { return result['WorldSkills Scale Score']; }));
var resultsAlbertVidalAward = Object.values(results
    .filter(function (result) { return result['WorldSkills Scale Score'] == maxResult; })
    .reduce(function (accumulator, result) {
        if (typeof accumulator[result['Member']] == 'undefined') {
            accumulator[result['Member']] = result;
            accumulator[result['Member']].competitors = [];
        }
        accumulator[result['Member']].competitors.push(result['First Name'] + ' ' + result['Last Name']);
        return accumulator;
    }, {}));

var sequence = 1;
var c = 0;

var sectors = Object.values(skills.skills.reduce(function (accumulator, skill) {

  let sectorId = skill.sector.id;
  if (typeof accumulator[sectorId] == 'undefined') {
      accumulator[sectorId] = skill.sector;
      accumulator[sectorId].skills = [];
  }

  delete skill.sector;

  accumulator[sectorId].skills.push(skill);

  skill.results = Object.values(results
      .filter(function (result) { return result['Skill Number'] == skill.number && result['Medal'] && result['Medal'].toUpperCase() != 'MEDALLION FOR EXCELLENCE'; })
      .reduce(function (accumulator, result) {
          if (typeof accumulator[result['Member']] == 'undefined') {
              accumulator[result['Member']] = result;
              accumulator[result['Member']].competitors = [];
          }
          accumulator[result['Member']].competitors.push(result['First Name'] + ' ' + result['Last Name']);
          return accumulator;
      }, {}));

  return accumulator;
}, {}));

// split large sectors
var sectorGroups = [];
for (let sector of sectors) {
  sectorGroups.push(sector);
  if (sector.skills.length >= 12) {
    // clone sector
    let sectorClone = JSON.parse(JSON.stringify(sector));
    sector.skills.splice(sector.skills.length / 2);
    sectorClone.skills.splice(0, sectorClone.skills.length / 2);
    sectorGroups.push(sectorClone);
  }
}

var xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';

xml += '<Root>\n';

function rewardingSequence (sequence, stage, skill) {
  let xml = '  <Rewarding Sequence="' + sequence + '" Stage="' + stage + '" Skill="' + skill.name.text + '" SkillRu="' + skillsRu.skills.filter(function (skillRu) { return skillRu.id === skill.id; }).map(function (skillRu) { return skillRu.name.text; }) + '">\n';
  let skillResults = skill.results.sort((a, b) => (a['Position'] > b['Position']) ? 1 : ((b['Position'] > a['Position']) ? -1 : (a['Member Name'] > b['Member Name']) ? 1 : ((b['Member Name'] > a['Member Name']) ? -1 : 0)));
  for (let result of skill.results) {
    xml += '    <Participant Country="' + result['Member'] + '" Reward="' + result['Medal'] + '" Name="' + result.competitors.join(', ') + '" />\n';
  }
  xml += '  </Rewarding>\n';
  return xml;
}

function callupSequence (sequence, stage, skill) {
  let xml = '  <Callup Sequence="' + sequence + '" Stage="' + stage + '" Skill="' + skill.name.text + '">\n';
  let skillResults = skill.results.sort((a, b) => (a['Member Name'] > b['Member Name']) ? 1 : ((b['Member Name'] > a['Member Name']) ? -1 : 0));
  for (let result of skillResults) {
    xml += '    <Country Code="' + result['Member'] + '" Name="' + result['Member Name'] + '" />\n';
  }
  xml += '  </Callup>\n';
  return xml;
}

function bestOfNationSequence (sequence, stage, result) {
  let xml = '  <BestOfNation Sequence="' + sequence + '" Stage="' + stage + '" CountryCode="' + result['Member'] + '" CountryName="' + result['Member Name'] + '" Name="' + result.competitors.join(', ') + '" />\n';
  return xml;
}

function albertVidalSequence (sequence, stage, results) {
  let xml = '  <AlbertVidalAward Sequence="' + sequence + '" Stage="' + stage + '">\n';
  let sortedResults = results.concat().sort((a, b) => (a['Member Name'] > b['Member Name']) ? 1 : ((b['Member Name'] > a['Member Name']) ? -1 : 0));
  for (let result of sortedResults) {
    xml += '    <Participant CountryCode="' + result['Member'] + '" CountryName="' + result['Member Name'] + '" Name="' + result.competitors.join(', ') + '" />\n';
  }
  xml += '  </AlbertVidalAward>\n';
  return xml;
}

for (let sector of sectorGroups) {

  //xml += '  <Sector Name="' + sector.name.text + '" />\n';

  var pendingSkills = {1: null, 2: null};

  for (let skill of sector.skills) {

    var stage = (c++ % 2 == 0) ? 2 : 1;

    if (pendingSkills[stage]) {
      xml += rewardingSequence(sequence, stage, pendingSkills[stage]);
      sequence += 1;
    }

    xml += callupSequence(sequence, stage, skill);

    pendingSkills[stage] = skill;

    sequence += 1;
  }

  // check for remaining skills

  for (let stage = 1; stage <= 2; stage++) {
    if (pendingSkills[stage]) {
      xml += rewardingSequence(sequence, stage, pendingSkills[stage]);
      sequence += 1;
    }
  }
}

var resultsBestOfNationMembers = [];
var resultBestOfNationHost;
for (let member of members.members) {
  var memberResult = resultsBestOfNations
    .filter(function (result) { return result['Member Name'] && result['Member'] == member.code; })
    .reduce(function (accumulator, result) {
      accumulator.competitors.push(result['First Name'] + ' ' + result['Last Name']);
      return accumulator;
    }, {'Member': member.code, 'Member Name': member.name.text, competitors: []});

  if (memberResult.competitors.length > 0) {
    if (member.code != 'RU') {
      resultsBestOfNationMembers.push(memberResult);
    } else {
      resultBestOfNationHost = memberResult;
    }
  }
}

for (var i = 1; i <= 99 && resultsBestOfNationMembers.length > 0; i++) {

    var resultsBestOfNationSlice = resultsBestOfNationMembers.splice(0, 5);

    var stage = (c++ % 2 == 0) ? 1 : 2;

    for (let result of resultsBestOfNationSlice) {
      xml += bestOfNationSequence(sequence, stage, result);
      sequence += 1;
    }
}

var stage = 1;
xml += bestOfNationSequence(sequence, stage, resultBestOfNationHost);
sequence += 1;

var stage = 1;
for (let result of resultsAlbertVidalAward) {
  xml += albertVidalSequence(sequence, stage, resultsAlbertVidalAward);
  sequence += 1;
}

xml += '</Root>\n';

fs.writeFileSync(__dirname + '/../data/xml/WSC2019_medal_awarding.xml', xml);

console.log(xml);

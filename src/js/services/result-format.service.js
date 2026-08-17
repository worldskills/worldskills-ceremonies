(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('ResultFormat', function (EXCEL_COLUMNS) {

        function capitalizeString(inputString) {
            return inputString.substring(0, 1).toUpperCase() + inputString.substring(1);
        }

        function capitalize(input) {
            if (input == null) return '';
            input = String(input).toLowerCase();

            var inputPieces = input.split(' ');
            for (var i = 0; i < inputPieces.length; i++) {
                inputPieces[i] = capitalizeString(inputPieces[i]);
            }
            input = inputPieces.join(' ');

            inputPieces = input.split('-');
            for (var i = 0; i < inputPieces.length; i++) {
                inputPieces[i] = capitalizeString(inputPieces[i]);
            }
            input = inputPieces.join('-');

            return input;
        }

        function normalizeSkillName(text) {
            if (text == null) return '';
            return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        // Normalize a skill number for comparison: strip leading zeros so "07" and "7" match.
        function normalizeSkillNum(n) {
            return String(n).trim().replace(/^0+(\d)/, '$1');
        }

        function simplifySkill(skill) {
            var s = {};
            s.name = normalizeSkillName(skill.name.text);
            s.number = skill.number;
            return s;
        }

        function simplifyResult(result) {
            var r = {};
            r.position = result[EXCEL_COLUMNS.POSITION];
            r.score = result[EXCEL_COLUMNS.SCALE_SCORE];
            if (result[EXCEL_COLUMNS.MEDAL]) {
                r.medal = capitalize(result[EXCEL_COLUMNS.MEDAL].trim());
            }
            r.member = result[EXCEL_COLUMNS.MEMBER_NAME];
            r.memberCode = result[EXCEL_COLUMNS.MEMBER];
            r.competitor = capitalize(result[EXCEL_COLUMNS.FIRST_NAME]) + ' ' + capitalize(result[EXCEL_COLUMNS.LAST_NAME]);
            return r;
        }

        function competitorsOf(result) {
            return result.competitors.join(', ');
        }

        return {
            capitalize: capitalize,
            capitalizeString: capitalizeString,
            normalizeSkillName: normalizeSkillName,
            normalizeSkillNum: normalizeSkillNum,
            simplifySkill: simplifySkill,
            simplifyResult: simplifyResult,
            competitorsOf: competitorsOf
        };
    });

})();

(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Excel', function () {

        function parse(data) {
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            return XLSX.utils.sheet_to_json(ws, { raw: false });
        }

        function readRows(file) {
            return file.arrayBuffer().then(function (buffer) {
                return parse(new Uint8Array(buffer));
            });
        }

        return { parse: parse, readRows: readRows };
    });

})();

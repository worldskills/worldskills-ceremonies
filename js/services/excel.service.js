(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Excel', function () {

        function parse(data) {
            var wb = XLSX.read(data, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            return XLSX.utils.sheet_to_json(ws, { raw: false });
        }

        // Reads an ngf-select'd file and resolves to its parsed rows.
        // Deliberately NOT routed through $q — file.arrayBuffer() is a native
        // promise outside Angular's digest, and every caller already wraps
        // its own .then() in $scope.$apply(); wrapping here too would
        // double-apply.
        function readRows(file) {
            return file.arrayBuffer().then(function (buffer) {
                return parse(new Uint8Array(buffer));
            });
        }

        return { parse: parse, readRows: readRows };
    });

})();

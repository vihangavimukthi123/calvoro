/**
 * API Base URL - used when frontend and backend are on different origins
 * - If not on port 3000, point to backend at localhost:3000
 * - Override: set window.CalvoroAPIBase before this script loads
 */
(function() {
    if (typeof window.CalvoroAPIBase !== 'undefined') return;
    try {
        var port = (window.location.port || '80');
        var host = window.location.hostname || 'localhost';
        var protocol = window.location.protocol || 'http:';
        if (protocol === 'file:') {
            window.CalvoroAPIBase = '/api';
        } else if (port !== '3000') {
            window.CalvoroAPIBase = protocol + '//' + host + ':3000';
        } else {
            window.CalvoroAPIBase = '';
        }
    } catch (e) {
        window.CalvoroAPIBase = '';
    }
})();

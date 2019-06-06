const request = require('request');
const WebSocket = require('ws');

// {"revision":46417,"levers":{"lever1":"down","lever2":"down","lever3":"down","lever4":"up"}}
// {"revision":46717,"levers":{"lever1":"no-change","lever2":"no-change","lever3":"no-change","lever4":"changed"}}

const normalizeLeversState = state => ({
    ...state,
    levers: Object.entries(state.levers).reduce((res, [key, value]) => ({
        ...res,
        [key]: value === 'down' ? 0 : 1
    }), {})
});

const normalizeLeversStateChange = change => ({
    ...change,
    levers: Object.entries(change.levers).reduce((res, [key, value]) => ({
        ...res,
        [key]: value === 'changed' ? 1 : 0
    }), {})
});

const getLeversState = () => new Promise((resolve, reject) => {
    request({
        method: 'GET',
        uri: 'http://node-test-task.javascript.ninja'
    }, (error, _, body) => {
        if (error) {
            reject(error);
            return;
        }

        try {
            const normalizedData = normalizeLeversState(JSON.parse(body));
            resolve(normalizedData);
        } catch (e) {
            // ooops...
        }
    });
});


const getLeversStateChangesAfterRevision = (revision, leversStateChanges) =>
    leversStateChanges
        .filter(state => state.revision > revision);

const getCurrentLeversState = (lastLeversState, leversStateChanges) => {
    const currentLeversState = {
        ...lastLeversState,
        levers: { ...lastLeversState.levers }
    };

    leversStateChanges.forEach(change => {
        currentLeversState.revision = change.revision;
        currentLeversState.levers = Object.entries(change.levers).reduce((res, [key, value]) => ({
            ...res,
            [key]: (currentLeversState.levers[key] + change.levers[key]) % 2
        }), {})
    });

    return currentLeversState;
};

const isLeversStateDown = state => !Object.values(state.levers).some(Boolean);

const checkToLeversStateIsDown = (() => {
    let lastLeversState = null;
    let requesting = false;

    return async (leversStateChanges, callback) => {
        if (!requesting) {
            requesting = true;
            lastLeversState = await getLeversState();
        }

        if (!lastLeversState) {
            return;
        }

        const lastLeversStateChanges = getLeversStateChangesAfterRevision(lastLeversState.revision, leversStateChanges);

        if (leversStateChanges.length === 0) {
            return;
        }

        const currentLeversState = getCurrentLeversState(lastLeversState, lastLeversStateChanges);

        if (isLeversStateDown(currentLeversState)) {
            callback();
        }
    };
})();



const ws = new WebSocket('ws://node-test-task.javascript.ninja');
const leversStateChanges = [];
let didShutdownWas = false;

ws.on('open', function open() {
    console.log('OPEN');
});

ws.on('message', data => {
    try {
        console.log(data);

        if (didShutdownWas) {
            ws.close();
            return;
        }

        const normalizedData = normalizeLeversStateChange(JSON.parse(data));
        leversStateChanges.push(normalizedData);

        checkToLeversStateIsDown(leversStateChanges, () => {
            didShutdownWas = true;
            ws.send('shutdown');
        });
    } catch (e) {
        // ooops...
    }
});

ws.on('close', () => {
    console.log('CLOSE');
});
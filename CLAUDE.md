# Gist

Daily personal operating brief — paper-forward, screen-minimizing. Angular 17 + Firebase.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Debugging note: the multi-SDK trap
Don't `import(...firebasejs/...firebase-auth.js)` from the browser console to grab a token — that pulls a *second* Firebase SDK copy with no registered app and throws `No Firebase App '[DEFAULT]'`. AngularFire already initialized a different copy. To trigger a Cloud Function manually, use the in-app button (`onGenerateOnDemand`) or pull the token from IndexedDB.

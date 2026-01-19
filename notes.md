## Features to build

- evening agent execution
  - calendar booking, email sending, morning gist configuration
- onboarding flow
  - taking in preferences about news
- marketing site (sort of built, but needs to be more salesy)
- payment checkout page
  - use stripe?
- fax delivery
  - convert Gist HTML to a PDF
  - send that PDF via a fax API
  - log delivery status
  - Show success/failure in the UI
- scheduler + reliability
  - add Cloud Scheduler
  - add error handling and retries
  - update delivery logs
  - add manual resend option
- payments + gating
  - gate fax delivery behind $18 plans
  - gate evening gist flow behind $25 plans
  - add pause/resume options
  - add invoice view

## Not a Gist feature, but still needs to be built

- customer feedback system
- incorporate company

## User flow

- user pays/signs up -> morning gist generates -> arrives on paper/web -> feels valuable

## To do

- review models and schemas
- review generateMorningGist() function
- remove or integrate tailwind (inclined to integrate actually)
- enable a dark mode

## Launch Plan

- invite small group of people to try it out
  - maybe first family (mother, brother, father)
  - then cousins (morin + sunday dinner group)
  - then philosophy club
  - zino, ricky
  - hop hotties
  - maddy, mikaela
- "I'm building a paper-first daily briefing that's meant to reduce screen time. I'm running a small pilot with people I trust to notice issues, as it's functional, but still experimental. I'd love you to try it for two weeks."
- Pilot pricing: free trial and then paid. And they can just pay if they'd like to keep going but it's not like this discounted thing. Well, maybe there's a founding rate, but you agree to answer questions?

## Marketing

- This product is for people who: care about their attention spans, think about how they live, dislike the current default tech patterns, are a little weird, like thing that are a little weird, aren't afraid to be a little weird
- The product has a philosophical spine -- attention, ritual, limits, embodiment
- For people with taste and anxiety and ambition

## Customer Feedback Questionnaire

1. Did you look at your phone less in the morning?
2. Did the Gist feel like "enough"?
3. Did paper change how you related to the information?
4. Did it reduce anxiety or decision fatigue?
5. What felt unnecessary or distracting?

## Competition

- Superhuman
- Notion
- Things/Omnifocus
- Meditation apps
- Paper planners

## User Profile

- founders, writers, academics, pastors

## Defensibility

- API contracts. This is a good reason for YC
- Also if founders are a customer, that's another good reason for YC

## Technical Architecture

- Gist is an AngularFire project
- Angular web framework on the frontend
- Firebase backend
- Google Cloud Services

A goal of running all "serious" functions in Google Cloud Functions, while UI and data rendering happen in the code that runs on in app/src. Otherwise it's in functions/src

- Gists are a first class concept
  - Everything revolves around gist/, delivery/, and agents/

- Agent work isolated into functions/
- Billing separated from product logic (functions/src/billing)

- can run ng deploy like ng serve. sweet. can also run ng build. cool. can also run ng deploy:functions. amazing!

- looking up box-sizing = border-box

## Later

- check if .wrap in app.component.scss is being used by any of the html and if not, delete it

## File Summaries

? = optional

### src/app/features/today

#### today.component.ts

```typescript
// holds calendar events for the day
type DayItem = { time?: string; title: string; note?: string };

// holds important news events for the day
type WorldItem = { headline: string; implication: string };

// holds the gist that is printed for the user each morning
type MorningGist = {
  id: string;
  userId: string;
  date: string;
  timezone: string;
  weatherSummary: string;
  firstEvent?: string;
  dayItems: DayItem[];
  worldItems: WorldItem[];
  gistBullets: string[];
  oneThing: string;
  delivery?: {
    method: "web" | "fax";
    pages: number;
    status: "queued" | "delivered" | "failed";
    deliveredAt: Timestamp;
  };
  createdAt?: Timestamp;
};

// metadata for the delivery of each gist as created by the cloudFunction
type DeliveryLog = {
  id: string;
  type: string; // morning | evening
  method: string; // fax | web
  status: string; // queued, delivered, failed, recieved
  pages?: number | null;
  createdAt?: Timestamp;
};

// adds more data to delivery log
type DeliveryLogRow = DeliveryLog & {
  createdAtLabel: string;
  statusClass: "ok" | "warn" | "bad";
};

function todayDateKeyNY(): string {
  /**
   * creates a YYYY-MM-DD dateKey
   * by generating a Y, M, D, Canada formatted date for an America/NY timezone
   * then splitting it into Y, M, D
   * and then chaining it together using string literals
   * and then returns that string
   * called when creating gists
   **/
}

class TodayComponent {
  /**
   * inject auth, db, router, and datapipe
   * set isSerif to true
   * hardcode 'metaText' and 'statusText' to "-"
   */

  gist$ = Observable<MorningGist | null>;
  /** define a stream that listens for the user's current morning gist
   * listens for auth
   * if the user is logged in, goes into firestore at path _users/{userId}/morningGist/{dateKey}* grab the document whenever it changes
   */

  deliveryLogs$ = Observable<DeliveryLogRow[] | null>;
  /**
   * define a stream that listens for the latest delivery logs
   * listens for auth
   * if the user is logged in, look for logs in the firestore db at users/{userId}/deliveryLogs
   * listens for new deliveryLogs and outputs the the last 4 of these logs (ordered by createdAt)
   * converts the deliveryLogs into deliveryLogRows by adding createdAtLabel, statusClass, etc via toLogRow()
   * */

  constructor() {
    /**
     * I take my gists that I've observed and my deliveryLogs that I've observed
     * I combine them into a new structure
     * whenever I get a new gist, log pair, I update metaText and statusText
     * and then I listen for metaText and statusText and then I set my (this class's) metaText and statusText variables to be what I've found
     * */
  }

  /** Button Functions */

  onPrint() {
    // call window.print()
  }

  onResend() {
    /**
     * [Demo Behavior] it changes the status text to 'queueing' and then to delivered after 900(nanoseconds?)
     * Should call a CloudFunction to (resend? gist? maybe generate update is a better idea. why am I resending)
     */
  }

  onEditTomorrow() {
    // currently just an alert, but should allow user to edit their next day's gist
  }

  toggleSerif() {
    // turns serifs off and on for text that gets printed
  }

  goToDelivery() {
    // navigate to delivery page
  }

  /** Helper Functions **/
  private toLogRow(log: DeliveryLog): DeliveryRowLog {
    /**
     * takes the createdAt timestamp on the DeliveryLog object and turns it into a date if it exists
     * otherwise it sets the const createdAtDate to null
     * then it creates a createdAtLabel from the createdAtDate if it's not null
     * and transforms it into a "MMM d • h:mm a" format.
     * e.g. "Jan 12 • 7:32 AM"
     * and if it can't do that, then it returns and em dash
     * finally,k calls statusToClass to get a statusClass
     * returns the delivery log, the createdAtLabel, and the statusClass
     * */
  }

  private statusToClass(status?: string): "ok" | "warn" | "bad" {
    /** Sorts the statues into either ok, bad or warn */
    // TODO: check where this is being done to see if that status being checked for are the status that could be passed in
  }

  private computeHeaderText(gist: MorningGist | null, logs: DeliveryLogRow[]): { metaText: string; statusText: string } {
    /**
     * Takes in a morningGist (which could be null) and an array of DeliveryLogs
     * Returns a metaText, statusText object ==> {metaText: string, statusText: string}
     * Meta line is the date, the location, and the time the gist was scheduled for
     * E.g. : "Saturday, Jan 10 • New York, NY • Scheduled 7:30 AM ET"
     * MVP is currently using gist.date, gist.timezone, and a hardcoded 'scheduled at' string
     *
     * gets the date and formats it using this.prettyDateFromDateKey(gist.date)
     * the city and the schedule time are both hardcoded
     * generates metaText from the date, city, and timezone
     *
     * pulls the delivery method from gist.delivery object, or the deliveryLog.method field if the former isn't there
     * pulls the pages parameter (max pages, or actual pages?) from the gist delivery object or from the deliveryLogs if the former isn't there
     *
     * pull deliveredAt from gist.delivery obejct if it's there, otherwise pull latest log time
     * turn deliveredAt into a 'h:mm a' format
     *
     * get the status, get the delivery method, concatenate all the pulled variables into metaText and statusText
     * */
  }

  private prettyDateFromDateKey(dateKey: string): string {
    /**
     * Split up the dateKey into the year, month, and day numbers
     * Create a local date (subtracting 1 from the month??)
     * I'm thinking this is a fix for the current UTC conversion for this month, will probably need to be revisted
     * Then return the date formated like 'Monday, Jan 12'
     * */
  }

  private capitalize(s: string): string {
    // Capitalize the first letter of the string
  }
}
```

### src/app/features/auth

#### login.component.ts

```typescript
(method) LoginComponent.loginWithGoogle(): Promise<void> {
  /**
   * Hm, why is this a method and not a function?
   *
   * Tries to log in with google using signInWithPopup() [a google]
   * signInWithPopup takes a new GoogleAuthProvider, which create the OAuth credentials needed
   * should navigate to 'today' page if successful
  */
}

(method) LoginComponent.loginWithEmail(): Promise<void> {
  /**
   * attempts to sign in with an email and password
   * routes to /today if successful
   * throws an error if not
  */
}
```

#### signup.component.ts

```typescript

(method) SignupComponent.pickPlan(plan: GistPlan): void {
  /**
   * Pick a plan
   * */
}

(method) SignupComponent.signupWithEmail(): Promise<void> {
  /**
   * Sign up with email
  */
}

(method) SignupComponent.signupWithGoogle(): Promise<void> {
  /**
   * Sign up with Google
  */
}

(method) SignupComponent.saveProfile(uid: string, email: string | null): Promise<void> {
  /**
   * Save profile to database at users/{userId}
  */
}





```

### functions/src

#### generateMorningGist.ts

```typescript
// Note that we initialize the app and then we import the google secrets. Could that have something to do with auth errors?

// get the db reference

type DeliveryMethod = 'web' | 'fax';

type GistPlan = 'web' | 'print' | 'loop';

type UserPrefs = {
  timezone?: string;
  city?: string;
  newsDomains?: string;
  tone?: string;
  maxPages?: number;
};

type UserDelivery = {
  method?: DeliveryMethod;
  faxNumber?: string;
  schedule? {
    hour?: number;
    minute?: number;
    weekdaysOnly?: boolean;
  };
}

type UserDoc = {
  uid: string;
  email: string | null;
  plan: GistPlan;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
}

type MorningGist = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  gistBullets: string[];
  oneThing: string;

  delivery: {
    method: DeliveryMethod;
    pages: number;
    status: 'queued' | 'delivered' | 'failed';
    deliveredAt?: Timestamp;
  };
    createdAt: Timestamp;
};

function toDateKeyISO(date: Date, timeZone: string): string {
  /**
   * produces YYYY-MM-DD in the user's timezone
   * (this is the Canadian date format)
  */
}

function safeTimezone(tz?: string | undefined): string {
  /**
   * tries to create a Date with the passed in timezone,
   * if it works, then return that timezone (it's safe)
   * if not, then return EST
  */
}

function estimatePages(maxPages?: number | undefined): number {
  /**
   * if no maxPages, then set to 2, but doesn't allow for a max higher than 3
  */
}

function fetchWorldItems(domains: string[]): Promise<{
    headline: string;
    implication: string;
}[]> {
  /**
   * Mocked out function to return news items
  */
}

function synthesizeGistBullets(input: {
    weather: string;
    firstEvent?: string | undefined;
    domains: string[];
}): string[] {
  /**
   * mocked out right now, but looks like the function to say the topline items on the morning briefing
   * weather, first event, focus for the day
  */
}

function computeOneThing(): string {
  /**
   * the 'oneThing' message
   * mocked to be 'Send one message that removes uncertainty today (then stop checking for replies).'
  */
}

async function queueFaxIfNeeded(params: {
    userId: string;
    faxNumber?: string | undefined;
    dateKey: string;
}): Promise<void> {
  /**
   * TODO: integrate Twilio Programmable Fax / Phaxio / SRFax etc.
   * if there's no faxNumber passed in, return
   * Otherwise add to a faxQueue collection on the db
  */
}


function writeDeliveryLog(userId: string, payload: {
    type: "morning";
    method: DeliveryMethod;
    status: string;
    pages?: number;
}): Promise<void> {
  /**
   * Write a delivery log row
  */
}

export async function generateMorningGistForUser(user: UserDoc, now: Date): Promise<void> {
  /**
   * create a timezone variable using safeTimezone
   * and a dateKey using dateKeyForISO
   * grab delivery method -- either the method on user's delivery object
   * or web if the user's plan is web, or fax
   *
   * grab the city from user.prefs?.city
   * if not there, use NYC --> note that city isn't a preference, the user's location should be one of their attributes
   *
   * grab the news domains from the user preferences
   * grab the number of pages by running estimate pages using user prefs
   *
   * set weather to 'weather unavailable' and then attempt to fetch weather from the api --> note, do this for calendar too
   *
   * ok, now I see why it wasn't in a try/catch, but I've put essentially the rest of the function in the try catch
   *
   * moving forward, want to separate calendar call and news call so i can put each in its own try catch and isolate the problem if things aren't working
   *
   * try to create the gist
   *  the calendar items, the world items, the first thing, the one thing,
   *
   * store it in the db at users/{userId}/morningGists/{YYYY-MM-DD}
   *
   * then write the delivery log
   * then queue fax if needed
   * then log 'Generated morning gist { userId, dateKey, method }
  */

 export const generateMorningGist: ScheduleFunction {
    /**
     * This is actual cloud schedule function
     * Currently runs them every 5 minutes
     * pulls in the necessary secrets -- the weatherApiKey, the googleClientId, the googleClientSecret
     * logs 'Morning Gist scheduler started'
     *
     * get all the users
     * get each user's data
     * if they don't have a userId, return
     * otherwise press on --
     * create a userDoc and generate a gist for that userDoc
     *
    */
 }

}









```

### functions/src/integrations

#### googleCalendarInt.ts

```typescript
/**
 * Pulls in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * But it does so by calling defineSecret. Could this mean it's creating a new secret each time instead of pulling existing secret?
 *
 * */
// define a calendar item type
type CalendarItem = { time?: string; title: string; note?: string };

// define a type StoredGoogleToken --> I think this is what's giving me trouble
type StoredGoogleToken = {
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expirtyDate?: string;
  idToken?: string;
};

// interesting syntax -- define a TokenStorageLocation object
// can be either an integration token or a user token
type TokenStorageLocation = { kind: "integration"; refPath: string } | { kind: "user"; userId: string };

// then get the db
const db = getFirestore();

function getSecretValue(secret: ReturnType<typeof defineSecret>): string | null {
  // get the secret value of the secret at defineSecret
}

function getOAuthConfig(): {
  clientId: string | null;
  clientSecret: string | null;
} {
  /**
   * Use getSecretValue to get the clientId and the clientSecret
   * */
}

async function loadStoredTokens(userId) {
  /**
   * gets an integration reference which is at
   * 'users/{userId}/integrations/googleCalendar'
   * [
   *      TODO: confirm this in db [x]
   *      that is not where it is!
   *      update user in firestore to match above structure [x]
   *      did that, still not loading calendar details
   * ]
   *
   * get an integrationSnap which awaits to integrationRef
   * if the document has an access token or a reference token
   * we return a struct that has that token it's location
   *
   * if we don't find a token that way
   * we define a userSnap that gets the user from the database
   * and then pull out that data by calling userSnap.data()
   *
   * and then we essentially try and find the data the same way?
   * by creating a nested variable
   * and assigning it to userData?.integrations?.googleCalendar
   *
   * if we find the data this way, we return a struct with the access or refresh token, and user (rather than integration) as the location
   *
   * OH, we were still finding the access token, it's in the legacy pathway
   * if we can't find the access toke the above two ways, we create a variable called legacy
   * we assign legacy to userData?.calendarIntegration
   * and then if legacy?.accessToken || legacy?.refreshToken
   * return a struct with the tokens and location as user
   * (like option B)
   *
   * otherwise, return { tokens: null, location: null }
   *
   * */
}

async function persistTokens(locations, tokens) {
  /**
   * If there's no location, return
   * create a struct payload, like below:
   *
   * payload = {
   *  accessToken: tokens.accessToken ?? null,
   *  refreshToken: tokens.refreshToken ?? null,
   *  scope: tokens.scope ?? null,
   *  tokenType: tokens.tokenType ?? null,
   *  expiryDate: tokens.expiryDate ?? null,
   *  idToken: tokens.idToken ?? null,
   *  updatedAt: new Date().toISOString(),
   * }
   *
   * if the location kind is integration,
   * add the payload to the accessToken at that location
   * otherwise, update the token at the user path
   *
   * debugging:
   * [
   *      doesn't seem like this ever ran,
   *      no updatedAt on the token in calendarIntegrations
   * ]
   * */
}

function getTimeZoneOffset(date: Date, timezone: string): number {
  /**
   * Get date time format by calling new Intl.DateTimeFormat
   * We want it to be a US format,
   * year as a number
   * 2 digit month, day, hour, minute, and second
   *
   * then break the date into parts
   *
   * then extract the actual values (the year, month, hour, etc)
   * and then map that onto a formatted date
   * and then get a new date object from those values
   *
   * then return the difference between the formattedDate's time and the passed in date's time
   *
   */
}

function buildTimeBounds(
  dateKey: string,
  timeZone: string,
): {
  timeMin: string;
  timeMax: string;
} {
  /**
   * I'm not sure what function this serves, but it builds some of upperbound and lower bound
   */
}

function formatTimeLabel(start: Date, end: Date | null, timeZone: string): string {
  /**
   * Format's the time label for the calendar events,
   * gives a start time and end time and
   * returns a time like `${startLabel}-${endLabel}`
   */
}

function cleanNote(location?: string | null | undefined, description?: string | null | undefined): string | undefined {
  /**
   * Turns the event location and description into a note on fetch calendar items
   */
}

async function extractGoogleApiError(response: Response): Promise<{
  status: number;
  statusText: string;
  bodyText?: string | undefined;
  bodyJson?: unknown;
  headers: Record<string, string>;
}> {
  /**
   * Takes in a response object
   * Looks through the headers in the response object
   * Maps the value of that header onto a record objec that tracks the headers and values in the error response
   *
   * then clones the response json into a variable called bodyJson
   *
   * then copies the text of the response into an object called bodyText, up to 1000 characters
   *
   * returns the above struct
   */
}

async function refreshAccessToken(
  tokens: StoredGoogleTokens,
  oauth: {
    clientId: string;
    clientSecret: string;
  },
): Promise<StoredGoogleTokens | null>;
{
  /**
   * Takes in token and an oauth object which is the clientId and the clientSecret
   *
   * if the token object doesn't have a refresh token, returns null
   *
   * creates a an object 'body' that's a URLSearchParams
   * made up of the oauth's clientId, clientSecret, the token's refresh token, and a 'grant_type' of 'refresh_token'
   *
   * the response awaits making a post request to oauth2.googleapis.com/token [seems like maybe not the right url]
   *
   * if we don't get the response, log 'Oauth Google token refresh failed' and return null  --> I'll note that I haven't seen this
   *
   * if we do get a response, turn the response's json into a data struct
   *
   * if the accessToken on the data struct is null, return null
   *
   * other wise, return the following
   */
  { accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
    scope: data.scope ?? tokens.scope,
    tokenType: data.token_type ?? tokens.tokenType,
    expiryDate: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : tokens.expiryDate,
    idToken: data.id_token ?? tokens.idToken,
  }
}

async function ensureFreshAccessToken(tokens: StoredGoogleTokens, oauth: {
    clientId: string;
    clientSecret: string;
}, location: TokenStorageLocation | null): Promise<StoredGoogleTokens | null> {
  /**
   * takes in a StoredGoogleTokens object, and an oauth object holding the clientId and clientSecret, and a TokenStorageLocation object
   *
   * if tokens doesn't have an access token, refresh the accessToken and persist the refreshedToken
   * return the refreshedToken
   *
   * if the tokens has no expiration date, or won't expire for at least another minute, then return that token
   *
   * otherwise, refresh the token and return the refreshed token
  */
}

async function listCalendarEvents(params: {
    accessToken: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
    userId: string;
}): Promise<{
    items: {
        summary?: string | null | undefined;
        location?: string | null | undefined;
        description?: string | null | undefined;
        start?: {
            date?: string | null | undefined;
            dateTime?: string | null | undefined;
        } | null | undefined;
        end?: {
            date?: string | null | undefined;
            dateTime?: string | null | undefined;
        } | null | undefined;
    }[];
}> {
  /**
   * Define the URL that we call, which is 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
   * set parameters such as 'single_event' and the time bounds of the events we care about
   *
   * call the api with the access token
   *
   * if the response doesn't come back ok
   * log 'Google Calendar API request failed, along with the error details (calling extractGoogleApiError) ==> I have seen this one a bunch
   * and then throw an error
   *
   * otherwise, reeturn the list of calendar events
   * */
}

export async function fetchCalendarItems(userId: string, dateKey: string, timeZone: string): Promise<CalendarItem[]> {
  /**
   *
   * get the clientId and clientSecret by calling getOauthConfig()
   * if there's no id or secret, log 'Google Calendar OAuth configuration missing'
   * and return empty array
   *
   * then get the tokens by calling loadStoredTokens(userId)
   * if no tokens, log 'No Google Calendar tokens available for this user'
   * return empty array
   *
   * then check for the freshness of the token
   * if not fresh enough log 'No valid Google Calendar access token'
   * return empty array
   *
   * if we haven't returned yet, we're good to go
   * create the timeBounds by calling buildTimeBounds(dateKey, timeZone)
   * create a data struct
   * let that data struct be equal to the result of listCalendarEvents
   * catch token errors and try and refresh them if needed
   *
   * then iterate through the items in the data struct (if they exist)
   * turn each calendar event into a {time, title, note}
   *
  */
}






```

### Debugging

```
Debugging the no gist problem:

1. Look at where the gists come from in today.component.html [x]
  a. Confirmed that we are serving the ng-template #noGist
2. Look at where this is decided [x]
  a. Confirmed that it comes from this snippet:  <ng-container *ngIf="gist$ | async as gist; else noGist">
3. I believe this is the same gist$ variable from the today class.
  a. Confirm by creating a fake gist and see if that will render [x]
  b. That did in fact render,
4. Dive into original observable gists$ call and see where things are getting blocked []
  a. It could just be there there is nothing to observe, because no new gists are getting made
  b. Manually put the same gist into firebase and see if it will render. change one thing so we know it's the new one
    aa. Added dateKey, nothing happened
    bb. Added userId, still nothing happened
    cc. It's because I wasn't logged in
5. Deleted old web app credentials in API manager, was thinking it was perhaps pointing to the wrong thing, and google said it's not good to have more than one OAuth Clients

TODO: Create a wrapper around calendar items so that we still get a gist even if calendar connection is broken

TODO: See if I can trace getOAuthConfig

Documentation: https://developers.google.com/identity/sign-in/web/sign-in




```

#### Mock Objects

```typescript
mockMorningGist: MorningGist = {
  id: "gist_2026_01_16",
  userId: "user_123",
  date: "2026-01-16", // YYYY-MM-DD
  timezone: "America/New_York",

  weatherSummary: "Cold but sunny. High of 38°F.",
  firstEvent: "10:00 AM — Product standup",

  dayItems: [
    {
      time: "8:00AM",
      title: "Finish Gist MVP flow",
      note: "task",
    },
    {
      time: "10:00AM",
      title: "30-minute walk",
      note: "ritual",
    },
  ],

  worldItems: [
    {
      headline: "Markets mixed ahead of Fed remarks",
      implication: "Big deal for your stocks and tings",
    },
    {
      headline: "Winter storm disrupts Midwest travel",
      implication: "Might affect your upcoming travel",
    },
  ],

  gistBullets: ["Focus on one thing that moves the product forward.", "Momentum beats perfection.", "Cold days reward discipline."],

  oneThing: "Ship the morning gist delivery pipeline",

  delivery: {
    method: "web",
    pages: 2,
    status: "delivered",
    deliveredAt: Timestamp.fromDate(new Date()),
  },

  createdAt: Timestamp.fromDate(new Date()),
};

gist$ = of(this.mockMorningGist);
```

### Helpful debugging tools

```typescript

//Line to read what an observable pipe thing is doing
tap(user => console.log('auth emitted:', user)),

authState(this.auth).pipe(
  tap(user => console.log('auth emitted:', user)),
  switchMap(user => {

```

# Gist

### Paper OS

#### Operating System

- morning briefing
- tell it things to keep into context or memory
- ask it to do stuff
- daily cycle?
  - morning --> orient: gist tells you what's up
  - day -> live: you tell gist things, ask it to do things, it may tell you things
  - evening -> reconcile: you give it final notes for the day, maybe it asks you to reflect on the day, and you do so
  - night -> process: gist does stuff to prepare for the next day
- machine can:
  - read handwriting
  - identify the sheet
  - query information
  - run software
  - print sheets
  - cut paper (?)
  - maybe punch/perforate
  - collate (look this up again) multiple sheets
- notification rules?
  - batching
  - logic around urgency
  - can you request information? the equivalent of checking messages on a fax machine? but there would be no notification. i don't want anything to induce anxiety though
- communicate with freinds, any friend, by sending them an email or a text, with the option to forward an image of the handwriting, and if the user has gist, there's image processing that will print out the handwriting as a scan (removing the background so it looks written onto the sheet of paper, not like a printed image of writing)
- actions
  - READ this
  - ANSWER this
  - REMEMBER this
  - DO this
  - FIND this
  - MAKE me a new sheet from this
- things the machine might excel at:
  - retrival, bookeeping, synthesis, translation between systems, remembering, calculating, checking, executing tedious steps
- types of things you may ask the machine to do
  - file notes, execute tasks, reconcile documents, research items, schedule items, log receipts, handle correspondence, update digital files, create something new
- MVP?
  - research -- search the web, retrieve information, summarize material
  - email -- search/read, draft, approval-to-send
  - calendar -- read schedule, add events, produce itinerary
  - recurring actions -- "every friday print..", "stop \_"
  - document generation -- summaries, docs, lists, letters, recipes, packets, schedules, reading materials
- internet powers
  - web research, email, calendar, scheduled jobs, printing. ok cool, exact same as above
- different types of paper output: one page answer, separate documents, confirmation (and maybe there's a simpler interface for that)

#### Idea Dump:

- would it be cool to be able to program the printer to print at differnt sizes? because then it could print you a little shopping list or greeting card ro something to stick onto the wall or put in your pocket. could the machine perforate?
- how to design the concept of memory?
- i like the idea of being able to scan in my morning pages, as unhinged as they are and as that sounds, and have it surface insights for me. would that change the relationship between man and her thoughts? maybe.
- the order that the paper goes in would/could mean something, and there would need to be a sense of, 'ive started a scanning session' and then 'session over'
- the morning briefing just becomes something that the user programs the machine to produce
  - but it does get rendered in gist language. there are gist specific design choices being made under the hood so that whatever gets printed is beautiful. and we can anticipate what the customer will ask and pre-determine what that looks like

#### Software

- needs memory --> data ballons quite quickly. will it rely on the connected ai model to hold context? or will it hold context itself?
- all caps in notes indicates a set of stored concepts. i presume gist is holding onto these, not the ai model. so, there's a mix. there's what your ai model already knows about you and that's why you use it, and then there's what gist knows about you that you've stored into our os, and we can tell you what we know and also share and/or delete that information at any time
- what we need to be able to connect to
  - email, banking, maps, government forms, reserach, shopping, travel, news, documents, claendars, messaging, search, workflows.
    - ok, if we have access to all of this, how to stop the machine from becoming the most easily hackable document of all time? there can be a password set up, that only the user knows, and it can be used to unlock. maybe like a pin? a number code, a tapping pattern, a button press rhythm? maybe you have 10 seconds, or 6, to customize to your own liking? like 10 beats and you press for the duration that's your password? or skip? i'd have to figure out how many permutations. or there's a keypad. or a fingerprint reader. or a password that the user writes on each write request to denote that it's them, or voice? i remember the voice activated diary i had as a kid. must be decently cheap/easy tech because i doubt that diary was too expensive if it was marketed to kids and my parents bought it for me. just looked it up, it retailed for 20-25. adjusted for inflation that's about 30-38 all in now.
- how will the user onboard? they'll connect the services they use -- ai model, banking api, email and calendar api, browser? amazon? what does gist know about vs what gets pushed onto the ai model?
- the layer that understands:
  - paper, people, tools, permissions, memory, automation, printing, physical interaction
- persistent state. how will we manage state and data. i guess i can start by building this for myself and figuring out what the machine would need to remember/know about me.
  - repeated jobs live in the system memory
- gist calls the api
- flow:
  - ai model -> understands intent and decides what tools to use
  - gist -> permissions, ememory, workflows, approvals, routing
  - connected services -> gmail, calendar, drive, banking, etc

#### Hardware

- sheet going in means i want your attention --> woul the machine just come alive when a scan is inserted? it'll have to match whatever the scanner's mechanism is. also, the wiring from the scanner to that big button might be necessary, maybe 2 buttons
- paper coming out means the machine wants your attention --> that makes sense
- make it easily serviceable so that it can be opened by screws

#### User Experience

- what is onboarding like? will you need to use a phone or a computer to onboard? connect your accounts via mygist.app?
- what if it also can give you information, cool things to read about, like a personal magazine as well as a personal newspaper, but devoid of ads. or maybe ads are opt in. like do you want to see things that people have paid for you to see? explicit opt in

The Paper

- beautiful typography
- generous margins --> can you mock up and scan back?
- little symbols
- perforations and different paper formats --> V2 i hire a designer to design the typography and symbols. the gist symbolic language
- so then does the user have to connect an ai model? like open claw? or do we have a built in one that we're using? but that would then require a subscription

#### Business Model

- we can host an ai model for a subscription if you don't want to bring your own. and they can start pretty cheap? maybe just pass through costs?
- $600 product (3x cost)
- the economics: margin on the machine, accessories and consumables if appropriate, upgrades every couple years, enterprise versions
- the value prop is the machine and the protocol. the translation layer between ai inputs and a printed sheet of paper
- addressable use cases: home admin, work, school, writing, research, government forms, finance, travel, healthcare paperwork, family logistics, correspondence, archives, creative work
- business lines: consumer hardware, office/enterprise machines, specialized versions for school or work, accessories/consumables, optional hosted services

#### Philosophy

- taste and discernment requires the space to make decisions. algorithms are constantly telling you and showing you, but stripping away visual stimulation causes you to look internally and imagine. from there you can t une into yourself and know what you want and then go and get it, and the machine can help with that too.
- it is also not for instant gratfication. it's for attention span. ask and move on to the next thing, responses come in batches
- note that if this works, people are occluded from ads. or ads

The questions we are asking:

- can paper serve as a general purpose interface for the internet

#### Plan:

- days 1-3 (by thursday) --> prove software loop. get the pi hooked up to the printer. configure one job. send an email via something i wrote down.
- days 3-5 (by sunday) --> purchase the exact hardware that's going to comprise the machine. build the complete guts (not enclosure yet)
- days 4-7 (by tuesday) --> have measured out what the enclosure should be based on the hardware i ordered, and see about prototyping it. got to 3D printing studios in bk, see if you can get a friend to help you
- days 7-9 (by next wednesay) --> build the machine.
- then, build the website to sell it.
  - just the machine at the center, heroically photographed, then the movie underneath. and the capabilities clearly listed
- write and record film. do i get teddy to direct it? and i give one to him as gift? i can't really afford to give them out. i want to shoot the video for free basically, but i do want it to look really good. also who is acting in it? it can't be me. christopher? mandy? danny? my dad? tami? jack?
  - christopher = professional handling emails by day and doing creative work by night
  - mandy = creative who doesn't want to look at her phone / bri as alternate
  - danny = busienss owner juggling multiple issues
  - my dad = doctor professional at his desk
  - tami = just a girl
  - jack = professor / ricky as alternate
  - users could be using it to: run a business, correspond and research, do homework, plan family logistics, write, avoid using their phone
- quippy phrase i may want to employ: "buy the machine, own the machine"
- plan launch party
  - at le pistol, second week of october. call it "paper party" and the machine will be demo'd. with a qr code where users can learn more, sign up for the email list, and of course purchase
    - so that means i'll need to set up my email marketing
    - make sure that installment pay is set up and well featured
    - 2 week refund policy (this is a bit of a gamble, but i'll say you can def return but since this is a limited handmade run you do need to have a quick chat with me so i can learn what didn't work for you)
    - lifetime warranty (if anything breaks you can get it repaired after a quick chat with me)
    - set up demo account
      - for queries requiring personal data spit out dummy stuff from demo account, for requests for informatino, return the information
- what to demo
  - handwritten thoughts from a notebook
  - a recipe torn from a magazine
  - letter to send --> could there be a postage api where you write a letter and put it into the machine and then it mails it to the user and the stamp just gets charged to your account. prepaid? or pre-auth?
  - something you're curious about
  - a bill to pay
  - a page syaing "i want to learn more about this"
  - an event flyer to put on the calendar
  - a travel idea
  - something you want remembered
  - a request to find a book (and maybe to book from the library)
  - one boring admin thing that needs handling

#### My own personal OS to run

- automatically order the parts when someone places an order

#### MMVP

- trigger a scan --> maybe my morning pages actually
- then it gets uploaded to the pi
- return action items for approval --> note that ideally there's a quick way to just say 'yes' that isn't scanning back another sheet of paper. like push once for yes and i'll execute, otherwise tell me what you want me to do

### THE INTERNET, VIA PAPER

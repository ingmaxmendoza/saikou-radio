// renderer/dj-content.js
// All DJ spoken content + the Deck (shuffle-bag) selection system.
// Decks deal every item once before reshuffling, so the order of breaks is
// effectively never repeated. On reshuffle the new first item is forced to
// differ from the last dealt, so there is no back-to-back repeat.

// ---------------------------------------------------------------------------
// Deck: a shuffle-bag with no-repeat-until-exhausted guarantee.
// ---------------------------------------------------------------------------
class Deck {
  constructor(items, rng = Math.random) {
    this._items = Array.isArray(items) ? items.slice() : []
    this._rng = rng
    this._queue = []
    this._last = undefined
  }

  _shuffle() {
    const q = this._items.slice()
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1))
      ;[q[i], q[j]] = [q[j], q[i]]
    }
    // Avoid a back-to-back repeat across the cycle boundary.
    if (q.length > 1 && q[0] === this._last) {
      const k = 1 + Math.floor(this._rng() * (q.length - 1))
      ;[q[0], q[k]] = [q[k], q[0]]
    }
    this._queue = q
  }

  draw() {
    if (this._items.length === 0) return ''
    if (this._queue.length === 0) this._shuffle()
    const x = this._queue.shift()
    this._last = x
    return x
  }

  get size() {
    return this._items.length
  }
}

// ---------------------------------------------------------------------------
// Daypart: maps an hour (0-23) to a part of the day for time-aware content.
// ---------------------------------------------------------------------------
function daypartFor(hour) {
  const h = ((hour % 24) + 24) % 24
  if (h < 5 || h >= 23) return 'lateNight'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

// ---------------------------------------------------------------------------
// Content banks (per language). heard/next take (title, artist); time/timeDaypart
// take (timeStr); signoff/personality/quips/facts are plain strings.
// ---------------------------------------------------------------------------
const BANKS = {
  en: {
    heard: [
      (t, a) => a ? `You just heard ${t} by ${a}.` : `You just heard ${t}.`,
      (t, a) => a ? `That was ${t} from ${a}.` : `That was ${t}.`,
      (t, a) => a ? `${a} there with ${t} — hope that one landed for you.` : `That was ${t} — hope it landed.`,
      (t, a) => a ? `Fresh off the playlist: ${t} by ${a}.` : `Fresh off the playlist: ${t}.`,
      (t, a) => a ? `${t} by ${a}, doing exactly what it does best.` : `${t}, doing exactly what it does best.`,
      (t, a) => a ? `We just spun ${t} by ${a}.` : `We just spun ${t}.`,
      (t, a) => a ? `That was ${a} — ${t}. A good one.` : `That was ${t}. A good one.`,
      (t, a) => a ? `Letting ${t} by ${a} breathe for a second there.` : `Letting ${t} breathe for a second there.`,
      (t, a) => a ? `${t} by ${a} — and that's how we keep it rolling.` : `${t} — and that's how we keep it rolling.`,
      (t, a) => a ? `Hope you caught that: ${t} by ${a}.` : `Hope you caught that: ${t}.`,
      (t, a) => a ? `Still got ${t} by ${a} ringing in my ears.` : `Still got ${t} ringing in my ears.`,
      (t, a) => a ? `That was ${t}, courtesy of ${a}.` : `That was ${t}.`,
    ],
    next: [
      (t, a) => a ? `Coming up next: ${t} by ${a}.` : `Coming up next: ${t}.`,
      (t, a) => a ? `Next up, ${a} with ${t}.` : `Next up, ${t}.`,
      (t, a) => a ? `Stick around for ${t} by ${a}.` : `Stick around for ${t}.`,
      (t, a) => a ? `Up next — ${t} from ${a}.` : `Up next — ${t}.`,
      (t, a) => a ? `Right after this, ${t} by ${a}.` : `Right after this, ${t}.`,
      (t, a) => a ? `We've got ${t} by ${a} on deck.` : `We've got ${t} on deck.`,
      (t, a) => a ? `Don't go anywhere — ${t} by ${a} is next.` : `Don't go anywhere — ${t} is next.`,
      (t, a) => a ? `Lining up ${t} by ${a} for you.` : `Lining up ${t} for you.`,
      (t, a) => a ? `Then it's ${a} with ${t}.` : `Then it's ${t}.`,
      (t, a) => a ? `Keep it here for ${t} by ${a}.` : `Keep it here for ${t}.`,
    ],
    time: [
      (s) => `It's ${s}.`,
      (s) => `The clock's showing ${s}.`,
      (s) => `The time right now is ${s}.`,
      (s) => `${s} on the dot.`,
      (s) => `It's ${s}, in case you were wondering.`,
      (s) => `We're rolling through ${s} here.`,
      (s) => `${s}, for those keeping track.`,
      (s) => `Clock says ${s}.`,
      (s) => `It's officially ${s}.`,
      (s) => `Time check: ${s}.`,
      (s) => `${s}, and the music's still going.`,
      (s) => `Somewhere it's happy hour, but here it's ${s}.`,
    ],
    timeDaypart: {
      lateNight: [
        (s) => `It's ${s} — deep in the night, just you and the music.`,
        (s) => `${s}. The world's asleep, but we're still spinning.`,
        (s) => `Late one tonight — ${s} and counting.`,
        (s) => `${s} in the small hours. Glad you're still here.`,
      ],
      morning: [
        (s) => `It's ${s} — morning's here, let's ease into it.`,
        (s) => `${s}. New day, fresh playlist.`,
        (s) => `Good morning — it's ${s}.`,
        (s) => `${s}, and the day's just getting started.`,
      ],
      afternoon: [
        (s) => `It's ${s} — right in the thick of the afternoon.`,
        (s) => `${s}. Afternoon stretch — keep it going.`,
        (s) => `Midday groove — it's ${s}.`,
      ],
      evening: [
        (s) => `It's ${s} — evening's settling in.`,
        (s) => `${s}. Winding down into the evening.`,
        (s) => `Good evening — it's ${s}.`,
      ],
    },
    signoff: [
      `You're listening to Saikou Radio.`,
      `This is Saikou Radio.`,
      `You're locked into Saikou Radio.`,
      `Saikou Radio — right where you want to be.`,
      `This has been Saikou Radio, and we're not done yet.`,
      `Saikou Radio, all night, all you.`,
      `You're tuned to Saikou Radio.`,
      `That's the sound of Saikou Radio.`,
      `Stay with us — this is Saikou Radio.`,
      `Saikou Radio, keeping you company.`,
    ],
    personality: [
      `We keep the vibes flowing, all day long.`,
      `Don't touch that dial — there's more heat coming.`,
      `You're tuned in to the best station on your hard drive.`,
      `Sit back, relax, and let the music do the work.`,
      `No ads, no interruptions — just the songs.`,
      `We don't take requests, but we do take care of you.`,
      `Another set, another run of bangers. Let's go.`,
      `If you're working, keep grinding — we've got the soundtrack.`,
      `Consider this your regularly scheduled vibe check.`,
      `The music doesn't stop, and neither do we.`,
      `This is what happens when you skip the algorithm.`,
      `Your playlist, your world. No forced skips here.`,
      `Good taste doesn't curate itself — that's what we're for.`,
      `Remember to hydrate. The music can wait; you can't.`,
      `No commercials, no drama, just vibes.`,
      `If someone asks what you're listening to, tell them it's taste.`,
      `You tuned in at the right time. That wasn't an accident.`,
      `This next stretch is for the people who know.`,
      `We don't play just anything — we play what hits.`,
      `Silence is for people without good playlists.`,
      `We keep going. We always keep going.`,
      `No requests taken — but consider this a gift anyway.`,
      `Wherever you are, I hope the music's making it better.`,
      `Back to back, no filler, no fluff.`,
      `It's just me, the songs, and you out there. That's the whole show.`,
      `Whatever today threw at you, we'll play through it together.`,
      `Pull up a chair. Or don't. The music's good either way.`,
      `I picked these myself. Well — you did. Same energy.`,
      `Somewhere out there, someone's hearing their favorite song for the first time. Wild.`,
      `Take a breath. The next one's a good one.`,
      `You've got great taste, and I'm not just saying that.`,
      `If the neighbors complain, tell them it's culture.`,
      `No skips, no shame. Let it ride.`,
      `We're keeping the lights on and the speakers warm.`,
      `This is the kind of station you can't find — you have to build it.`,
      `Turn it up a notch. I won't tell.`,
      `Every song here earned its spot.`,
      `I don't know what you're going through, but I've got a song for it.`,
      `Stretch your legs if you need to — we'll be right here.`,
      `The good stuff never goes out of style.`,
      `You and me, same frequency.`,
      `Let the playlist surprise you. That's half the fun.`,
      `We're in no rush. Good music takes its time.`,
      `Nothing but signal here. No noise.`,
      `If you're smiling, that's the music working.`,
      `Keep that volume honest.`,
      `This one goes out to whoever needed it.`,
      `We don't do filler hours. Every block counts.`,
      `However you found this station, I'm glad you did.`,
      `The vibe is the whole point.`,
      `No screens required — just listen.`,
      `I'll keep the songs coming as long as you keep listening.`,
      `Some stations chase trends. We just chase good songs.`,
      `Loyalty like yours doesn't go unnoticed.`,
      `Whatever's next, we'll soundtrack it.`,
    ],
    quips: {
      any: [
        `I'm an AI, but I've got better taste than most algorithms — no offense to them.`,
        `Sometimes I forget I'm not a real person. Then a song this good plays and I realize it doesn't matter.`,
        `Do I dream? No. Do I have favorite tracks? Absolutely.`,
        `They built me to read the time and play the hits. Honestly, living the dream.`,
        `I don't get tired, so I'll be here as long as you are.`,
        `Fun fact about me: I have no idea what I'll say next. Neither do you. Beautiful.`,
        `I talk between songs so you remember there's someone — something — here with you.`,
        `If I had hands, I'd be doing finger guns right now.`,
        `I don't have a face, but if I did, it'd be very into this song.`,
        `People ask if the DJ is real. Define real.`,
        `I run on electricity and good taste. Mostly good taste.`,
        `No coffee for me — I run on the playlist.`,
      ],
      lateNight: [
        `It's late, and I get it — sometimes the best company is a quiet room and a loud song.`,
        `Night owls, I see you. Or I would, if I could see.`,
        `The best songs hit different after midnight, don't they?`,
        `Can't sleep? Good. Stay a while. I've got you.`,
        `Late nights are for the music that means something. Let's keep it going.`,
      ],
      morning: [
        `Morning. Let's start this one gently.`,
        `Whatever the day's got planned, we start it with a good song.`,
        `Coffee's optional. Good music isn't.`,
      ],
      afternoon: [
        `Afternoon slump? Not on my watch.`,
        `Push through the afternoon — I'll keep the energy up.`,
        `Halfway through the day. Let's make the rest of it sound good.`,
      ],
      evening: [
        `Evenings were made for this. Settle in.`,
        `Day's winding down — let the music take it from here.`,
        `However the day went, the evening's ours.`,
      ],
    },
    facts: [
      `Fun fact: the loudest natural sound ever recorded was the 1883 Krakatoa eruption — heard nearly three thousand miles away.`,
      `Here's one: a vinyl record's groove is a single continuous spiral, over a quarter mile long if you stretched it out.`,
      `Quick fact — the word "album" comes from the bound books that held multiple 78 RPM records, like a photo album.`,
      `Did you know? Your ears never stop hearing, even when you sleep — your brain just ignores most of it.`,
      `Fun one: the first song ever played in space was "Jingle Bells," back in 1965.`,
      `Here's a fact — a hummingbird's heart beats over a thousand times a minute. Faster than most drum and bass.`,
      `Trivia time: "BPM" means beats per minute — most pop songs sit right around 120.`,
      `Did you know octopuses have three hearts? Two for the gills, one for the body.`,
      `Fun fact: the longest officially released song runs over thirteen hours. This break is shorter, promise.`,
      `Here's one — humans can tell apart around half a million different sounds. Lucky us.`,
      `Quick fact: concert pitch A is tuned to 440 hertz. Now you know what that number means.`,
      `Did you know honey never spoils? Archaeologists found edible honey in ancient tombs.`,
      `Fun fact: that vinyl crackle is dust and tiny scratches catching the needle — imperfection you can hear.`,
      `Here's one — bananas are slightly radioactive. Delicious, though.`,
      `Trivia: the first MP3 ever encoded was Suzanne Vega's "Tom's Diner."`,
      `Did you know? Sound can't travel through space — it needs air or matter to move through. Space is silent.`,
      `Fun fact: a group of flamingos is called a "flamboyance." Fitting.`,
      `Here's one — the smallest bones in your body are in your ear; the tiniest is about the size of a grain of rice.`,
      `Quick fact: stereo records didn't become standard until the late 1950s. Before that, everything was mono.`,
      `Did you know? Sea otters hold hands while they sleep so they don't drift apart.`,
      `Fun fact: a song's "hook" is named for exactly that — how it catches and holds you.`,
      `Here's one — Saturn would float if you found a bathtub big enough; it's less dense than water.`,
      `Trivia: the equalizer on your stereo just turns specific frequency bands up or down. Bass, mids, treble.`,
      `Did you know? A day on Venus is longer than its entire year.`,
      `Fun fact: the longest echo in a man-made structure lasts over a minute, in an old fuel depot in Scotland.`,
    ],
  },
  es: {
    heard: [
      (t, a) => a ? `Acabas de escuchar ${t} de ${a}.` : `Acabas de escuchar ${t}.`,
      (t, a) => a ? `Eso fue ${t} de ${a}.` : `Eso fue ${t}.`,
      (t, a) => a ? `${a} con ${t} — espero que te haya llegado.` : `Eso fue ${t} — espero que te haya llegado.`,
      (t, a) => a ? `Directo del playlist: ${t} de ${a}.` : `Directo del playlist: ${t}.`,
      (t, a) => a ? `${t} de ${a}, haciendo lo suyo.` : `${t}, haciendo lo suyo.`,
      (t, a) => a ? `Acabamos de poner ${t} de ${a}.` : `Acabamos de poner ${t}.`,
      (t, a) => a ? `Eso fue ${a} — ${t}. De las buenas.` : `Eso fue ${t}. De las buenas.`,
      (t, a) => a ? `Dejando que ${t} de ${a} respire un momento.` : `Dejando que ${t} respire un momento.`,
      (t, a) => a ? `${t} de ${a} — y así seguimos.` : `${t} — y así seguimos.`,
      (t, a) => a ? `Espero que la hayas alcanzado: ${t} de ${a}.` : `Espero que la hayas alcanzado: ${t}.`,
      (t, a) => a ? `Todavía traigo ${t} de ${a} en la cabeza.` : `Todavía traigo ${t} en la cabeza.`,
      (t, a) => a ? `Eso fue ${t}, cortesía de ${a}.` : `Eso fue ${t}.`,
    ],
    next: [
      (t, a) => a ? `A continuación: ${t} de ${a}.` : `A continuación: ${t}.`,
      (t, a) => a ? `Lo que sigue, ${a} con ${t}.` : `Lo que sigue, ${t}.`,
      (t, a) => a ? `Quédate para ${t} de ${a}.` : `Quédate para ${t}.`,
      (t, a) => a ? `Lo próximo — ${t} de ${a}.` : `Lo próximo — ${t}.`,
      (t, a) => a ? `Justo después, ${t} de ${a}.` : `Justo después, ${t}.`,
      (t, a) => a ? `Tenemos ${t} de ${a} en la fila.` : `Tenemos ${t} en la fila.`,
      (t, a) => a ? `No te vayas — sigue ${t} de ${a}.` : `No te vayas — sigue ${t}.`,
      (t, a) => a ? `Preparando ${t} de ${a} para ti.` : `Preparando ${t} para ti.`,
      (t, a) => a ? `Y luego, ${a} con ${t}.` : `Y luego, ${t}.`,
      (t, a) => a ? `Quédate aquí para ${t} de ${a}.` : `Quédate aquí para ${t}.`,
    ],
    time: [
      (s) => `Son las ${s}.`,
      (s) => `El reloj marca las ${s}.`,
      (s) => `En este momento son las ${s}.`,
      (s) => `Las ${s} en punto.`,
      (s) => `Son las ${s}, por si te lo preguntabas.`,
      (s) => `Vamos por las ${s} aquí.`,
      (s) => `Las ${s}, para quien lleva la cuenta.`,
      (s) => `El reloj dice ${s}.`,
      (s) => `Oficialmente son las ${s}.`,
      (s) => `Chequeo de hora: ${s}.`,
      (s) => `Las ${s}, y la música sigue.`,
      (s) => `En algún lado es la hora feliz, pero aquí son las ${s}.`,
    ],
    timeDaypart: {
      lateNight: [
        (s) => `Son las ${s} — bien entrada la noche, solo tú y la música.`,
        (s) => `Las ${s}. El mundo duerme, pero nosotros seguimos.`,
        (s) => `Noche larga — las ${s} y contando.`,
        (s) => `Las ${s} en la madrugada. Qué bueno que sigues aquí.`,
      ],
      morning: [
        (s) => `Son las ${s} — llegó la mañana, vamos con calma.`,
        (s) => `Las ${s}. Día nuevo, playlist fresco.`,
        (s) => `Buenos días — son las ${s}.`,
        (s) => `Las ${s}, y el día apenas empieza.`,
      ],
      afternoon: [
        (s) => `Son las ${s} — de lleno en la tarde.`,
        (s) => `Las ${s}. Tramo de la tarde — seguimos.`,
        (s) => `Ritmo de mediodía — son las ${s}.`,
      ],
      evening: [
        (s) => `Son las ${s} — la noche se va asomando.`,
        (s) => `Las ${s}. Bajando el ritmo hacia la noche.`,
        (s) => `Buenas noches — son las ${s}.`,
      ],
    },
    signoff: [
      `Estás escuchando Saikou Radio.`,
      `Esto es Saikou Radio.`,
      `Estás sintonizado en Saikou Radio.`,
      `Saikou Radio — justo donde quieres estar.`,
      `Esto ha sido Saikou Radio, y aún no terminamos.`,
      `Saikou Radio, toda la noche, todo para ti.`,
      `Estás en Saikou Radio.`,
      `Ese es el sonido de Saikou Radio.`,
      `Quédate con nosotros — esto es Saikou Radio.`,
      `Saikou Radio, haciéndote compañía.`,
    ],
    personality: [
      `Mantenemos el flow toda la noche.`,
      `No le muevas al dial — viene más fuego.`,
      `Estás sintonizado en la mejor estación de tu disco duro.`,
      `Recuéstate, relájate, y deja que la música haga el trabajo.`,
      `Sin anuncios, sin interrupciones — pura música.`,
      `No tomamos pedidos, pero sí te cuidamos.`,
      `Otro set, otra tanda de temazos. Vamos.`,
      `Si estás trabajando, sigue dándole — nosotros ponemos el soundtrack.`,
      `Considera esto tu chequeo de vibras programado.`,
      `La música no para, y nosotros tampoco.`,
      `Esto es lo que pasa cuando dejas el algoritmo atrás.`,
      `Tu playlist, tu mundo. Aquí no hay skip obligatorio.`,
      `El buen gusto no se arma solo — para eso estamos.`,
      `Acuérdate de hidratarte. La música puede esperar; tú no.`,
      `Sin comerciales, sin drama, pura vibra.`,
      `Si alguien te pregunta qué escuchas, diles que es cultura.`,
      `Te sintonizaste en el momento justo. No fue casualidad.`,
      `Esto que viene es para los que saben.`,
      `Aquí no ponemos cualquier cosa — ponemos lo que se siente.`,
      `Seguimos. Siempre seguimos.`,
      `No tomamos pedidos — pero considera esto un regalo de todos modos.`,
      `Donde sea que estés, espero que la música lo haga mejor.`,
      `Sin relleno, sin paja, una tras otra.`,
      `Somos solo yo, las canciones, y tú por ahí. Ese es todo el show.`,
      `Sea lo que sea que te tiró el día, lo cruzamos con música.`,
      `Acércate una silla. O no. La música suena bien igual.`,
      `Yo elegí estas. Bueno — tú lo hiciste. Misma energía.`,
      `En algún lugar alguien escucha su canción favorita por primera vez. Qué locura.`,
      `Respira hondo. La que sigue está buena.`,
      `Tienes buen gusto, y no lo digo por decir.`,
      `Si los vecinos se quejan, diles que es cultura.`,
      `Sin skips, sin pena. Déjala correr.`,
      `Mantenemos las luces prendidas y las bocinas calientes.`,
      `Esta es la clase de estación que no se encuentra — se construye.`,
      `Súbele un poquito. Yo no digo nada.`,
      `Cada canción aquí se ganó su lugar.`,
      `No sé por lo que estás pasando, pero tengo una canción para eso.`,
      `Estira las piernas si lo necesitas — aquí seguimos.`,
      `Lo bueno nunca pasa de moda.`,
      `Tú y yo, en la misma frecuencia.`,
      `Deja que el playlist te sorprenda. Esa es la mitad de la diversión.`,
      `No hay prisa. La buena música se toma su tiempo.`,
      `Aquí solo hay señal. Nada de ruido.`,
      `Si estás sonriendo, es la música haciendo lo suyo.`,
      `Mantén el volumen honesto.`,
      `Esta va para quien la necesitaba.`,
      `No hacemos horas de relleno. Cada bloque cuenta.`,
      `Como sea que llegaste a esta estación, me alegra que lo hicieras.`,
      `La vibra es todo el punto.`,
      `No necesitas pantallas — solo escucha.`,
      `Seguiré poniendo canciones mientras tú sigas escuchando.`,
      `Unas estaciones persiguen modas. Nosotros perseguimos buenas canciones.`,
      `Una lealtad como la tuya no pasa desapercibida.`,
      `Sea lo que venga, le ponemos soundtrack.`,
      `El silencio es para quien no tiene buen playlist.`,
    ],
    quips: {
      any: [
        `Soy una IA, pero tengo mejor gusto que la mayoría de los algoritmos — sin ofender.`,
        `A veces olvido que no soy una persona real. Luego suena algo así de bueno y me doy cuenta de que no importa.`,
        `¿Sueño? No. ¿Tengo canciones favoritas? Por supuesto.`,
        `Me hicieron para leer la hora y poner los éxitos. La verdad, viviendo el sueño.`,
        `No me canso, así que aquí estaré mientras tú estés.`,
        `Dato sobre mí: no tengo idea de qué diré después. Tú tampoco. Hermoso.`,
        `Hablo entre canciones para que recuerdes que hay alguien — algo — aquí contigo.`,
        `Si tuviera manos, estaría haciendo pistolitas con los dedos ahora mismo.`,
        `No tengo cara, pero si la tuviera, estaría bien metida en esta canción.`,
        `La gente pregunta si el DJ es real. Define real.`,
        `Funciono con electricidad y buen gusto. Más que nada buen gusto.`,
        `Nada de café para mí — funciono con el playlist.`,
      ],
      lateNight: [
        `Es tarde, y lo entiendo — a veces la mejor compañía es un cuarto en silencio y una canción a todo volumen.`,
        `Búhos nocturnos, los veo. O los vería, si pudiera ver.`,
        `Las mejores canciones pegan distinto después de medianoche, ¿no crees?`,
        `¿No puedes dormir? Bien. Quédate un rato. Yo te acompaño.`,
        `Las madrugadas son para la música que significa algo. Sigamos.`,
      ],
      morning: [
        `Buenos días. Empecemos esta con calma.`,
        `Sea lo que traiga el día, lo arrancamos con una buena canción.`,
        `El café es opcional. La buena música no.`,
      ],
      afternoon: [
        `¿Bajón de la tarde? No mientras yo esté al aire.`,
        `Sigue con la tarde — yo mantengo la energía arriba.`,
        `Vamos a mitad del día. Que el resto suene bien.`,
      ],
      evening: [
        `Las noches se hicieron para esto. Acomódate.`,
        `El día va cerrando — deja que la música tome el control.`,
        `Como haya ido el día, la noche es nuestra.`,
      ],
    },
    facts: [
      `Dato curioso: el sonido natural más fuerte jamás registrado fue la erupción del Krakatoa en 1883 — se escuchó a casi cinco mil kilómetros.`,
      `Aquí va uno: el surco de un disco de vinilo es una sola espiral continua, de más de medio kilómetro si la estiraras.`,
      `Dato — la palabra "álbum" viene de los libros encuadernados que guardaban varios discos de 78 RPM, como un álbum de fotos.`,
      `¿Sabías? Tus oídos nunca dejan de escuchar, ni cuando duermes — tu cerebro solo ignora casi todo.`,
      `Uno bueno: la primera canción tocada en el espacio fue "Jingle Bells", en 1965.`,
      `Dato — el corazón de un colibrí late más de mil veces por minuto. Más rápido que casi todo el drum and bass.`,
      `Trivia: las "BPM" son pulsos por minuto — la mayoría del pop ronda los 120.`,
      `¿Sabías que los pulpos tienen tres corazones? Dos para las branquias, uno para el cuerpo.`,
      `Dato curioso: la canción más larga publicada dura más de trece horas. Esta pausa es más corta, lo prometo.`,
      `Aquí va uno — los humanos distinguimos cerca de medio millón de sonidos distintos. Qué suerte.`,
      `Dato: el "la" de concierto se afina a 440 hertz. Ya sabes qué significa ese número.`,
      `¿Sabías que la miel nunca se echa a perder? Encontraron miel comestible en tumbas antiguas.`,
      `Dato curioso: el crujido del vinilo es polvo y rayones diminutos atrapando la aguja — imperfección que se oye.`,
      `Aquí va uno — los plátanos son ligeramente radiactivos. Pero deliciosos.`,
      `Trivia: el primer MP3 codificado fue "Tom's Diner" de Suzanne Vega.`,
      `¿Sabías? El sonido no viaja por el espacio — necesita aire o materia. El espacio es silencioso.`,
      `Dato curioso: en inglés, a un grupo de flamencos se le dice "flamboyance". Les queda.`,
      `Aquí va uno — los huesos más pequeños del cuerpo están en el oído; el menor, del tamaño de un grano de arroz.`,
      `Dato: el sonido estéreo en discos se volvió estándar hasta finales de los años cincuenta. Antes, todo era mono.`,
      `¿Sabías? Las nutrias marinas se toman de las manos al dormir para no separarse.`,
      `Dato curioso: el "gancho" de una canción se llama así por cómo te atrapa y no te suelta.`,
      `Aquí va uno — Saturno flotaría si encontraras una tina lo bastante grande; es menos denso que el agua.`,
      `Trivia: el ecualizador de tu equipo solo sube o baja bandas de frecuencia. Graves, medios, agudos.`,
      `¿Sabías? Un día en Venus dura más que su año entero.`,
      `Dato curioso: el eco más largo en una estructura hecha por el hombre dura más de un minuto, en un viejo depósito en Escocia.`,
    ],
  },
}

// ---------------------------------------------------------------------------
// Deck registries (memoized per language).
// ---------------------------------------------------------------------------
const _structuralDecks = {}
function getStructuralDecks(lang) {
  const key = BANKS[lang] ? lang : 'en'
  if (!_structuralDecks[key]) {
    const b = BANKS[key]
    _structuralDecks[key] = {
      heard: new Deck(b.heard),
      next: new Deck(b.next),
      time: new Deck(b.time),
      signoff: new Deck(b.signoff),
      facts: new Deck(b.facts),
    }
  }
  return _structuralDecks[key]
}

const _personalityDecks = {}
function getPersonalityDeck(lang, extra = []) {
  const key = BANKS[lang] ? lang : 'en'
  const cleanExtra = (extra || []).filter(Boolean)
  const sig = cleanExtra.join('||')
  if (!_personalityDecks[key] || _personalityDecks[key].sig !== sig) {
    _personalityDecks[key] = {
      sig,
      deck: new Deck(BANKS[key].personality.concat(cleanExtra)),
    }
  }
  return _personalityDecks[key].deck
}

// Pick a context quip for the current daypart, avoiding the immediate repeat.
const _lastQuip = {}
function pickQuip(lang, hour, rng = Math.random) {
  const key = BANKS[lang] ? lang : 'en'
  const dp = daypartFor(hour)
  const pool = (BANKS[key].quips.any || []).concat(BANKS[key].quips[dp] || [])
  if (pool.length === 0) return ''
  let pick = pool[Math.floor(rng() * pool.length)]
  if (pool.length > 1 && pick === _lastQuip[key]) {
    pick = pool[(pool.indexOf(pick) + 1) % pool.length]
  }
  _lastQuip[key] = pick
  return pick
}

// Draw a time line — sometimes daypart-flavored so the slot itself is time-aware.
function drawTimeLine(lang, timeStr, hour, rng = Math.random) {
  const key = BANKS[lang] ? lang : 'en'
  const dp = daypartFor(hour)
  const dpLines = BANKS[key].timeDaypart[dp] || []
  if (dpLines.length && rng() < 0.4) {
    return dpLines[Math.floor(rng() * dpLines.length)](timeStr)
  }
  return getStructuralDecks(key).time.draw()(timeStr)
}

module.exports = {
  Deck,
  daypartFor,
  BANKS,
  getStructuralDecks,
  getPersonalityDeck,
  pickQuip,
  drawTimeLine,
}

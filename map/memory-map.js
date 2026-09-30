/*!
 * Memory Map — embeddable Leaflet map component (prototype)
 * Works in any site: WordPress (Custom HTML block), Webflow (Embed), plain HTML.
 * Requires: Leaflet 1.9, Leaflet.markercluster 1.5, PapaParse 5 (loaded before this file).
 *
 * Usage:
 *   <div data-memory-map
 *        data-locations="https://…/locations.csv"
 *        data-routes="https://…/routes.csv"
 *        data-lang="de"></div>
 */
(function () {
  'use strict';

  /* ---------- Config ---------- */

  var CATEGORIES = {
    denkmal:       { de: 'Denkmal',       en: 'Monument',            color: '#b5452f' },
    gedenkstaette: { de: 'Gedenkstätte',  en: 'Memorial site',       color: '#2f5d8a' },
    gedenktafel:   { de: 'Gedenktafel',   en: 'Plaque',              color: '#7a5c99' },
    stein:         { de: 'Stein der Erinnerung', en: 'Stone of Remembrance', color: '#c28a1e' },
    gebaeude:      { de: 'Benennung / Gebäude',  en: 'Naming / Building',    color: '#3f7f5f' },
    museum:        { de: 'Museum',        en: 'Museum',              color: '#3f7f5f' }
  };
  /* Country codes used in the "country" column (ISO 3166 alpha-2). Add more as needed. */
  var COUNTRIES = {
    AT: { de: 'Österreich', en: 'Austria' },  BA: { de: 'Bosnien und Herzegowina', en: 'Bosnia and Herzegovina' },
    BG: { de: 'Bulgarien', en: 'Bulgaria' },  CZ: { de: 'Tschechien', en: 'Czechia' },
    DE: { de: 'Deutschland', en: 'Germany' }, HR: { de: 'Kroatien', en: 'Croatia' },
    HU: { de: 'Ungarn', en: 'Hungary' },      MD: { de: 'Moldau', en: 'Moldova' },
    ME: { de: 'Montenegro', en: 'Montenegro' }, RO: { de: 'Rumänien', en: 'Romania' },
    RS: { de: 'Serbien', en: 'Serbia' },      SI: { de: 'Slowenien', en: 'Slovenia' },
    SK: { de: 'Slowakei', en: 'Slovakia' },   UA: { de: 'Ukraine', en: 'Ukraine' }
  };
  var FALLBACK_CATEGORY = { de: 'Sonstiges', en: 'Other', color: '#666666' };

  var UI = {
    de: {
      search: 'Suchen…', all: 'Alle', allCountries: 'Alle Länder', routes: 'Wege der Erinnerung', noRoute: '— Weg wählen —',
      details: 'Details', navigate: 'Hierhin navigieren', website: 'Website', close: 'Schließen',
      stop: 'Station', of: 'von', prev: 'Zurück', next: 'Weiter', endRoute: 'Weg beenden',
      openInMaps: 'Gesamten Weg in Google Maps öffnen', results: 'Orte', result: 'Ort', loadError: 'Die Kartendaten konnten nicht geladen werden.',
      tapAgain: 'Erneut tippen für Details',
      noResults: 'Keine Orte gefunden.', reset: 'Filter zurücksetzen'
    },
    en: {
      search: 'Search…', all: 'All', allCountries: 'All countries', routes: 'Remembrance routes', noRoute: '— Choose a route —',
      details: 'Details', navigate: 'Navigate here', website: 'Website', close: 'Close',
      stop: 'Stop', of: 'of', prev: 'Back', next: 'Next', endRoute: 'End route',
      openInMaps: 'Open whole route in Google Maps', results: 'places', result: 'place', loadError: 'The map data could not be loaded.',
      tapAgain: 'Tap again for details',
      noResults: 'No places found.', reset: 'Reset filters'
    }
  };

  var DEFAULT_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var DEFAULT_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var CAN_HOVER = window.matchMedia && window.matchMedia('(hover: hover)').matches;

  /* ---------- Helpers ---------- */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loadCsv(url) {
    return new Promise(function (resolve, reject) {
      if (!url) return resolve([]);
      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: true,
        complete: function (r) { resolve(r.data); },
        error: reject
      });
    });
  }
  function cat(key) { return CATEGORIES[key] || FALLBACK_CATEGORY; }

  /* Validate rows so one broken spreadsheet row can't break the whole map */
  function cleanLocations(rows) {
    var out = [];
    rows.forEach(function (r, i) {
      var lat = parseFloat(String(r.lat).replace(',', '.'));
      var lng = parseFloat(String(r.lng).replace(',', '.'));
      if (!r.id || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.warn('[memory-map] Skipped row ' + (i + 2) + ' (missing id or invalid coordinates):', r);
        return;
      }
      r.id = r.id.trim(); r.lat = lat; r.lng = lng;
      r.category = (r.category || '').trim().toLowerCase();
      r.country = (r.country || '').trim().toUpperCase();
      out.push(r);
    });
    return out;
  }

  /* ---------- Component ---------- */

  function MemoryMap(root) {
    this.root = root;
    this.lang = root.getAttribute('data-lang') === 'en' ? 'en' : 'de';
    this.activeCats = {};        // empty = all
    this.query = '';
    this.country = '';
    this.markers = {};           // id -> L.marker
    this.locations = [];
    this.routes = [];
    this.route = null;           // { data, stops, index, line }
    this.tapped = null;          // touch: id of marker tapped once
    this.build();
    this.load();
  }

  MemoryMap.prototype.t = function (k) { return UI[this.lang][k]; };
  MemoryMap.prototype.f = function (row, field) {
    return row[field + '_' + this.lang] || row[field + '_de'] || row[field + '_en'] || '';
  };

  MemoryMap.prototype.build = function () {
    var self = this, root = this.root;
    root.classList.add('dm-root');
    root.innerHTML = '';

    this.bar = el('div', 'dm-bar');
    this.search = el('input', 'dm-search');
    this.search.type = 'search';
    var searchTimer;
    this.search.addEventListener('input', function () {
      var v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { self.query = v.trim().toLowerCase(); self.applyFilters(true); }, 350);
    });
    this.chips = el('div', 'dm-chips');
    this.countrySel = el('select', 'dm-country-select');
    this.countrySel.addEventListener('change', function () { self.country = this.value; self.applyFilters(true); });
    this.routeSel = el('select', 'dm-route-select');
    this.routeSel.addEventListener('change', function () { this.value ? self.startRoute(this.value) : self.endRoute(); });
    this.langBtn = el('button', 'dm-lang');
    this.langBtn.type = 'button';
    this.langBtn.addEventListener('click', function () { self.setLang(self.lang === 'de' ? 'en' : 'de'); });
    this.count = el('span', 'dm-count');
    this.count.setAttribute('aria-live', 'polite');
    this.bar.append(this.search, this.langBtn, this.countrySel, this.routeSel, this.chips, this.count);

    this.stage = el('div', 'dm-stage');
    this.mapEl = el('div', 'dm-map');
    this.panel = el('aside', 'dm-panel');
    this.panel.setAttribute('aria-live', 'polite');
    this.empty = el('div', 'dm-empty');
    this.empty.hidden = true;
    this.stage.append(this.mapEl, this.empty, this.panel);
    root.append(this.bar, this.stage);

    this.map = L.map(this.mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([47.6, 13.3], 7);
    L.tileLayer(root.getAttribute('data-tiles') || DEFAULT_TILES, {
      attribution: root.getAttribute('data-attribution') || DEFAULT_ATTR, maxZoom: 19, subdomains: 'abcd'
    }).addTo(this.map);
    // Enable wheel zoom only after the user interacts, so the page doesn't get "stuck" scrolling
    this.map.once('focus click', function () { self.map.scrollWheelZoom.enable(); });
    this.map.on('click', function () { self.tapped = null; });

    this.cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45,
      iconCreateFunction: function (c) {
        return L.divIcon({ className: 'dm-cluster', html: '<span>' + c.getChildCount() + '</span>', iconSize: [38, 38] });
      }
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);

    this.renderUiText();
  };

  MemoryMap.prototype.load = function () {
    var self = this, r = this.root;
    Promise.all([loadCsv(r.getAttribute('data-locations')), loadCsv(r.getAttribute('data-routes'))])
      .then(function (res) {
        self.locations = cleanLocations(res[0]);
        self.routes = res[1].filter(function (x) { return x.id && x.stops; });
        self.createMarkers();
        self.renderChips();
        self.renderCountrySelect();
        self.renderRouteSelect();
        self.applyFilters(true);
        self.openFromHash();
      })
      .catch(function (e) {
        console.error('[memory-map]', e);
        self.panel.innerHTML = '<div class="dm-error">' + esc(self.t('loadError')) + '</div>';
        self.root.classList.add('dm-panel-open');
      });
  };

  /* ---------- Markers ---------- */

  MemoryMap.prototype.pinIcon = function (loc, num) {
    var c = cat(loc.category).color;
    return L.divIcon({
      className: 'dm-pin-wrap',
      html: '<span class="dm-pin" style="--dm-c:' + c + '">' + (num ? '<b>' + num + '</b>' : '') + '</span>',
      iconSize: [30, 30], iconAnchor: [15, 15], tooltipAnchor: [0, -16]
    });
  };

  MemoryMap.prototype.cardHtml = function (loc) {
    var c = cat(loc.category);
    var img = loc.image_url
      ? '<img src="' + esc(loc.image_url) + '" alt="" loading="lazy">'
      : '<div class="dm-card-ph" style="--dm-c:' + c.color + '"></div>';
    return '<div class="dm-card">' + img +
      '<div class="dm-card-body"><span class="dm-tag" style="--dm-c:' + c.color + '">' + esc(c[this.lang]) +
      (loc.year ? ' · ' + esc(loc.year) : '') + '</span>' +
      '<strong>' + esc(this.f(loc, 'title')) + '</strong>' +
      (CAN_HOVER ? '' : '<em>' + esc(this.t('tapAgain')) + '</em>') + '</div></div>';
  };

  MemoryMap.prototype.createMarkers = function () {
    var self = this;
    this.locations.forEach(function (loc) {
      var m = L.marker([loc.lat, loc.lng], { icon: self.pinIcon(loc), title: self.f(loc, 'title'), alt: self.f(loc, 'title'), riseOnHover: true });
      m.bindTooltip(self.cardHtml(loc), { direction: 'top', className: 'dm-tip', opacity: 1 });
      m.on('click', function () {
        var stopIdx = self.route ? self.route.stops.indexOf(loc.id) : -1;
        if (stopIdx !== -1) { self.showStop(stopIdx); return; }
        if (CAN_HOVER || self.tapped === loc.id) { self.openDetail(loc.id); self.tapped = null; }
        else { self.tapped = loc.id; m.openTooltip(); }   // touch: 1st tap = preview, 2nd tap = details
      });
      m.on('keypress', function (e) { if (e.originalEvent.key === 'Enter') self.openDetail(loc.id); });
      m._dmLoc = loc;
      self.markers[loc.id] = m;
    });
  };

  MemoryMap.prototype.visible = function (loc) {
    var cats = Object.keys(this.activeCats);
    if (cats.length && !this.activeCats[loc.category]) return false;
    if (this.country && loc.country !== this.country) return false;
    if (!this.query) return true;
    var hay = [loc.title_de, loc.title_en, loc.address, loc.year].join(' ').toLowerCase();
    return hay.indexOf(this.query) !== -1;
  };

  MemoryMap.prototype.applyFilters = function (fit) {
    var self = this, shown = [];
    this.cluster.clearLayers();
    this.locations.forEach(function (loc) {
      var inRoute = self.route && self.route.stops.indexOf(loc.id) !== -1;
      if (inRoute) return;                        // route stops are drawn in the route layer
      if (self.visible(loc)) shown.push(self.markers[loc.id]);
    });
    this.cluster.addLayers(shown);
    var total = shown.length + (this.route ? this.route.stops.length : 0);
    this.count.textContent = total + ' ' + this.t(total === 1 ? 'result' : 'results');
    this.renderEmpty(total === 0);
    // Move the map to the results, otherwise matches can be off-screen and the filter looks broken
    if (fit && shown.length && !this.route) {
      var bounds = L.featureGroup(shown).getBounds();
      if (shown.length === 1) this.map.flyTo(bounds.getCenter(), 14, { duration: 0.6 });
      else this.map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 14, duration: 0.6 });
    }
  };

  MemoryMap.prototype.renderEmpty = function (isEmpty) {
    var self = this;
    this.empty.hidden = !isEmpty;
    if (!isEmpty) return;
    this.empty.innerHTML = '<p>' + esc(this.t('noResults')) + '</p><button type="button">' + esc(this.t('reset')) + '</button>';
    this.empty.querySelector('button').addEventListener('click', function () { self.resetFilters(); });
  };

  MemoryMap.prototype.resetFilters = function () {
    this.activeCats = {}; this.country = ''; this.query = '';
    this.search.value = ''; this.countrySel.value = '';
    this.renderChips();
    this.applyFilters(true);
  };

  /* ---------- UI text / language ---------- */

  MemoryMap.prototype.renderUiText = function () {
    this.search.placeholder = this.t('search');
    this.search.setAttribute('aria-label', this.t('search'));
    this.langBtn.textContent = this.lang === 'de' ? 'EN' : 'DE';
    this.langBtn.setAttribute('aria-label', this.lang === 'de' ? 'English' : 'Deutsch');
    this.routeSel.setAttribute('aria-label', this.t('routes'));
  };

  MemoryMap.prototype.renderChips = function () {
    var self = this;
    this.chips.innerHTML = '';
    var used = {};
    this.locations.forEach(function (l) { used[l.category] = true; });
    var all = el('button', 'dm-chip' + (Object.keys(this.activeCats).length ? '' : ' is-on'), esc(this.t('all')));
    all.type = 'button';
    all.addEventListener('click', function () { self.activeCats = {}; self.renderChips(); self.applyFilters(true); });
    this.chips.append(all);
    Object.keys(used).forEach(function (key) {
      var c = cat(key);
      var b = el('button', 'dm-chip' + (self.activeCats[key] ? ' is-on' : ''), '<i style="--dm-c:' + c.color + '"></i>' + esc(c[self.lang]));
      b.type = 'button';
      b.setAttribute('aria-pressed', !!self.activeCats[key]);
      b.addEventListener('click', function () {
        // One category at a time: tap = show only this one, tap it again = show all
        var wasOn = !!self.activeCats[key];
        self.activeCats = {};
        if (!wasOn) self.activeCats[key] = true;
        self.renderChips(); self.applyFilters(true);
      });
      self.chips.append(b);
    });
    var on = this.chips.querySelector('.is-on');
    if (on && this.chips.scrollWidth > this.chips.clientWidth) this.chips.scrollLeft = on.offsetLeft - 12;
  };

  MemoryMap.prototype.renderCountrySelect = function () {
    var self = this, used = {};
    this.locations.forEach(function (l) { if (l.country) used[l.country] = true; });
    var codes = Object.keys(used);
    this.countrySel.hidden = codes.length < 2;
    this.countrySel.setAttribute('aria-label', this.t('allCountries'));
    this.countrySel.innerHTML = '';
    var o = el('option', null, esc(this.t('allCountries'))); o.value = ''; this.countrySel.append(o);
    codes.map(function (c) { return [c, COUNTRIES[c] ? COUNTRIES[c][self.lang] : c]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); })
      .forEach(function (c) { var op = el('option', null, esc(c[1])); op.value = c[0]; self.countrySel.append(op); });
    this.countrySel.value = this.country;
  };

  MemoryMap.prototype.renderRouteSelect = function () {
    var self = this, cur = this.route ? this.route.data.id : '';
    this.routeSel.innerHTML = '';
    this.routeSel.hidden = !this.routes.length;
    var o = el('option', null, esc(this.t('noRoute'))); o.value = ''; this.routeSel.append(o);
    this.routes.forEach(function (r) {
      var op = el('option', null, esc(self.f(r, 'title'))); op.value = r.id; self.routeSel.append(op);
    });
    this.routeSel.value = cur;
  };

  MemoryMap.prototype.setLang = function (lang) {
    var self = this;
    this.lang = lang;
    this.root.setAttribute('data-lang', lang);
    this.renderUiText(); this.renderChips(); this.renderCountrySelect(); this.renderRouteSelect();
    Object.keys(this.markers).forEach(function (id) {
      var m = self.markers[id];
      m.setTooltipContent(self.cardHtml(m._dmLoc));
    });
    this.applyFilters();
    if (this.route) this.showStop(this.route.index, true);
    else if (this.openId) this.openDetail(this.openId, true);
  };

  /* ---------- Detail panel ---------- */

  MemoryMap.prototype.openDetail = function (id, noFly) {
    var loc = this.markers[id] && this.markers[id]._dmLoc;
    if (!loc) return;
    this.openId = id;
    var c = cat(loc.category);
    var img = loc.image_url ? '<img class="dm-hero" src="' + esc(loc.image_url) + '" alt="">' : '<div class="dm-hero dm-card-ph" style="--dm-c:' + c.color + '"></div>';
    var nav = 'https://www.google.com/maps/dir/?api=1&destination=' + loc.lat + ',' + loc.lng;
    this.panel.innerHTML =
      '<button class="dm-close" type="button" aria-label="' + esc(this.t('close')) + '">×</button>' + img +
      '<div class="dm-panel-body"><span class="dm-tag" style="--dm-c:' + c.color + '">' + esc(c[this.lang]) + (loc.year ? ' · ' + esc(loc.year) : '') + '</span>' +
      '<h3>' + esc(this.f(loc, 'title')) + '</h3>' +
      (loc.address ? '<p class="dm-addr">' + esc(loc.address) + '</p>' : '') +
      '<p>' + esc(this.f(loc, 'text')) + '</p>' +
      '<p class="dm-links"><a href="' + nav + '" target="_blank" rel="noopener">' + esc(this.t('navigate')) + ' ↗</a>' +
      (loc.link ? '<a href="' + esc(loc.link) + '" target="_blank" rel="noopener">' + esc(this.t('website')) + ' ↗</a>' : '') + '</p></div>';
    this.bindClose();
    this.root.classList.add('dm-panel-open');
    this.setHash('loc=' + id);
    var self = this;
    setTimeout(function () { self.map.invalidateSize(); if (!noFly) self.flyTo(loc); }, 260);
  };

  MemoryMap.prototype.bindClose = function () {
    var self = this;
    this.panel.querySelector('.dm-close').addEventListener('click', function () {
      if (self.route) self.endRoute(); else self.closePanel();
    });
  };

  MemoryMap.prototype.closePanel = function () {
    this.openId = null;
    this.root.classList.remove('dm-panel-open');
    this.setHash('');
    var self = this;
    setTimeout(function () { self.map.invalidateSize(); }, 260);
  };

  MemoryMap.prototype.flyTo = function (loc) {
    var m = this.markers[loc.id];
    var z = Math.max(this.map.getZoom(), 15);
    if (!CAN_HOVER) m.closeTooltip();                 // phones: the bottom sheet already shows the content
    var open = function () { if (CAN_HOVER) m.openTooltip(); };
    if (this.cluster.hasLayer(m)) this.cluster.zoomToShowLayer(m, open);
    else { this.map.flyTo([loc.lat, loc.lng], z, { duration: 0.8 }); setTimeout(open, 850); }
  };

  /* ---------- Routes ---------- */

  MemoryMap.prototype.startRoute = function (routeId) {
    var self = this;
    var data = this.routes.filter(function (r) { return r.id === routeId; })[0];
    if (!data) return;
    this.endRoute(true);
    var stops = data.stops.split('|').map(function (s) { return s.trim(); }).filter(function (id) {
      if (!self.markers[id]) { console.warn('[memory-map] Route "' + routeId + '" references unknown location:', id); return false; }
      return true;
    });
    if (!stops.length) return;
    var pts = stops.map(function (id) { var l = self.markers[id]._dmLoc; return [l.lat, l.lng]; });
    var line = L.polyline(pts, { className: 'dm-route-line', weight: 4 });
    this.route = { data: data, stops: stops, index: 0, line: line };
    this.applyFilters();                        // pulls the stops out of the cluster first
    line.addTo(this.routeLayer);
    stops.forEach(function (id, i) {
      var m = self.markers[id];
      m.setIcon(self.pinIcon(m._dmLoc, i + 1));
      self.routeLayer.addLayer(m);
    });
    this.root.classList.add('dm-route-on');
    this.map.fitBounds(line.getBounds(), { padding: [60, 60] });
    this.setHash('route=' + routeId);
    setTimeout(function () { self.showStop(0); }, 400);
  };

  MemoryMap.prototype.showStop = function (i, noFly) {
    var r = this.route; if (!r) return;
    r.index = Math.max(0, Math.min(i, r.stops.length - 1));
    var self = this, id = r.stops[r.index], loc = this.markers[id]._dmLoc, c = cat(loc.category);
    var all = r.stops.map(function (s) { var l = self.markers[s]._dmLoc; return l.lat + ',' + l.lng; });
    var gmaps = 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + all[0] +
      '&destination=' + all[all.length - 1] + (all.length > 2 ? '&waypoints=' + all.slice(1, -1).join('|') : '');
    var list = r.stops.map(function (s, n) {
      return '<li class="' + (n === r.index ? 'is-on' : '') + '" data-i="' + n + '"><b>' + (n + 1) + '</b>' + esc(self.f(self.markers[s]._dmLoc, 'title')) + '</li>';
    }).join('');
    this.panel.innerHTML =
      '<button class="dm-close" type="button" aria-label="' + esc(this.t('endRoute')) + '">×</button>' +
      '<div class="dm-panel-body dm-route">' +
      '<span class="dm-tag dm-tag-route">' + esc(this.t('routes')) + '</span>' +
      '<h3>' + esc(this.f(r.data, 'title')) + '</h3><p class="dm-intro">' + esc(this.f(r.data, 'intro')) + '</p>' +
      '<div class="dm-stop"><span class="dm-stop-n">' + esc(this.t('stop')) + ' ' + (r.index + 1) + ' ' + esc(this.t('of')) + ' ' + r.stops.length + '</span>' +
      '<span class="dm-tag" style="--dm-c:' + c.color + '">' + esc(c[this.lang]) + (loc.year ? ' · ' + esc(loc.year) : '') + '</span>' +
      '<h4>' + esc(this.f(loc, 'title')) + '</h4><p>' + esc(this.f(loc, 'text')) + '</p></div>' +
      '<div class="dm-steps"><button type="button" class="dm-prev"' + (r.index === 0 ? ' disabled' : '') + '>← ' + esc(this.t('prev')) + '</button>' +
      '<button type="button" class="dm-next"' + (r.index === r.stops.length - 1 ? ' disabled' : '') + '>' + esc(this.t('next')) + ' →</button></div>' +
      '<ol class="dm-stoplist">' + list + '</ol>' +
      '<p class="dm-links"><a href="' + gmaps + '" target="_blank" rel="noopener">' + esc(this.t('openInMaps')) + ' ↗</a></p></div>';
    this.bindClose();
    this.panel.querySelector('.dm-prev').addEventListener('click', function () { self.showStop(r.index - 1); });
    this.panel.querySelector('.dm-next').addEventListener('click', function () { self.showStop(r.index + 1); });
    Array.prototype.forEach.call(this.panel.querySelectorAll('.dm-stoplist li'), function (li) {
      li.addEventListener('click', function () { self.showStop(+li.getAttribute('data-i')); });
    });
    this.root.classList.add('dm-panel-open');
    setTimeout(function () {
      self.map.invalidateSize();
      if (!noFly) self.map.flyTo([loc.lat, loc.lng], 17, { duration: 0.9 });
      if (!CAN_HOVER) self.markers[id].closeTooltip();
      else setTimeout(function () { self.markers[id].openTooltip(); }, noFly ? 0 : 950);
    }, 260);
  };

  MemoryMap.prototype.endRoute = function (silent) {
    var self = this, r = this.route;
    if (!r) { if (!silent) this.closePanel(); return; }
    r.stops.forEach(function (id) { var m = self.markers[id]; m.closeTooltip(); m.setIcon(self.pinIcon(m._dmLoc)); });
    this.routeLayer.clearLayers();
    this.route = null;
    this.root.classList.remove('dm-route-on');
    this.routeSel.value = '';
    this.applyFilters(!silent);
    if (!silent) this.closePanel();
  };

  /* ---------- Deep links (#loc=id / #route=id) ---------- */

  MemoryMap.prototype.setHash = function (h) {
    if (!this.root.hasAttribute('data-deeplinks')) return;
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  };
  MemoryMap.prototype.openFromHash = function () {
    var m = /^#(loc|route)=([\w-]+)$/.exec(location.hash);
    if (!m) return;
    if (m[1] === 'loc') this.openDetail(m[2]);
    else { this.routeSel.value = m[2]; this.startRoute(m[2]); }
  };

  /* ---------- Boot ---------- */

  function boot() {
    if (!window.L || !L.markerClusterGroup || !window.Papa) {
      console.error('[memory-map] Leaflet, Leaflet.markercluster and PapaParse must be loaded first.');
      return;
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-memory-map]'), function (n) {
      if (!n._memoryMap) n._memoryMap = new MemoryMap(n);
    });
  }
  window.MemoryMap = { init: boot, categories: CATEGORIES, countries: COUNTRIES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

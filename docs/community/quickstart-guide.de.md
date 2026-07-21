# Violet + BADU Blue — Kurzanleitung

> Quelltext für den "Kurzanleitung"-Beitrag im Homey-Community-Thema (ID 157109).
> Als Antwort in diesem Thema posten (nicht den ursprünglichen Ankündigungs-Beitrag
> überschreiben) und mit dieser Datei synchron halten — siehe
> [HOMEY.md § Community Quickstart Guide](../../HOMEY.md) für den Update-Prozess.
> Englische Version: `quickstart-guide.en.md`.

Diese App bindet deinen **PoolDigital Violet**- oder **BADU-Blue**-Poolregler
lokal in Homey ein — ganz ohne Cloud-Konto, ohne PoolDigital-Login. Alles unten
gilt für beide gleichermaßen; BADU Blue ist Speck Pumpens Badge derselben
PoolDigital-Hardware.

## Voraussetzungen

- Ein Homey Pro (lokale Plattform)
- Dein Violet-/BADU-Blue-Regler im selben Netzwerk wie Homey
- Empfehlung: dem Regler eine statische IP geben, damit Homey ihn nach einem
  Router-Neustart nicht verliert

## Einrichtung

1. App aus dem [Homey App Store](https://homey.app/de-de/app/de.neunbft.violet/Violet-Poolsteuerung/) installieren.
2. Ein **Pool**-Gerät hinzufügen und Host oder IP des Reglers eingeben. Zuerst
   `violet.local` versuchen; löst das in deinem Netzwerk nicht auf, stattdessen
   die IP-Adresse des Reglers verwenden.
3. Das Gerät erscheint mit Kacheln für die Anlagenteile, die dein Regler
   tatsächlich meldet — keine leeren Kacheln für nicht vorhandene Ausstattung.
4. Werte auslesen (Temperatur, pH, Pumpenstatus usw.) funktioniert sofort, ganz
   ohne Passwort.

Für die reine Überwachung ist das schon alles. Zwei optionale Funktionen gehen
weiter — beide sind bis zur Aktivierung ausgeschaltet:

## Optional: das Wasserbalance-Sicherheitsnetz

**LSI berechnen** in den Geräte-Einstellungen aktivieren und Calciumhärte,
Gesamtalkalität und Cyanursäure eintragen (aus Testkit oder PoolLab). Die App
ermittelt daraus fortlaufend, ob dein Wasser **korrosiv**, **ausgeglichen** oder
**kalkabscheidend** ist — mit dem aktuellen pH-Wert und der aktuellen
Temperatur, nicht nur dem Stand vom letzten Test.

Warum das wichtig ist: korrosives Wasser greift Kupfer- und Eisenteile an
(besonders die Heizung), kalkabscheidendes Wasser setzt Kalk an Fliesen und
Leitungen ab. Sobald die Balance aus dem Rahmen läuft, bekommst du einen
Homey-Alarm und einen Flow-Trigger — rechtzeitig, um zu handeln, bevor einer der
beiden Schäden entsteht.

## Optional: den Pool von Homey aus steuern

**Steuerung aktivieren (Schreibzugriff)** in den Geräte-Einstellungen
einschalten, um Pumpe, Licht, DMX-Szenen und PV-Überschuss-Modus über
Homey-Kacheln und Flow zu steuern. Dafür braucht es Benutzername/Passwort für
den Regler — am besten ein eigenes Konto mit minimalen Rechten, da die lokale
API der Violet unverschlüsseltes HTTP im LAN nutzt. Zum Auslesen ist nie ein
Passwort nötig, nur zum Schreiben von Befehlen.

## Anlagenteile ein-/ausblenden

Jede Ausstattungsgruppe (Heizung, Solar, Abdeckung, Rückspülung, Frischwasser,
Überlaufbehälter, Dosierung, …) hat eine Einstellung **Auto / Immer anzeigen /
Ausblenden**. Auto — die Standardeinstellung — zeigt eine Kachel nur, wenn dein
Regler diese Hardware tatsächlich meldet, damit die Geräteansicht auf das
fokussiert bleibt, was du wirklich installiert hast.

## Flow-Automatisierung

Alles, was die App liest oder tut, steht in Flow zur Verfügung: Trigger für
LSI-Warnungen, Dosierprobleme, Rückspül- und Überlaufbehälter-Störungen; Aktionen
zum Setzen von Pumpen-/Licht-/DMX-/PV-Überschuss-Modus und zum Aktualisieren der
Wasserchemie-Werte. Alarme erscheinen außerdem automatisch in den
Alarm-Kacheln des Geräts.

## Alarm-Benachrichtigungen von der Violet empfangen

Die Violet kann ihre eigenen Alarme direkt an Homey senden (getrennt von den
oben genannten LSI-/Dosier-Alarmen der App) und löst dabei den Flow-Trigger
**„Ein Alarm wurde empfangen"** aus.

So richtest du es ein:

1. In den Benachrichtigungs-Einstellungen der Violet als Empfänger die IP-Adresse
   deines Homey eintragen, mit dem **Alarm-Empfangsport** aus den
   Geräte-Einstellungen (Standard `22222`).
2. Die normale Weboberfläche der Violet kann ihren eigenen Empfangsport nicht
   ändern — dafür gibt es eine undokumentierte Seite. Im Browser
   `http://<violet-ip>/modifyParameter.htm?NOTIFY_http_baseport` öffnen, denselben
   Port dort eintragen und speichern. (Die Geräte-Einstellungen in Homey zeigen
   diesen Hinweis auch direkt neben dem Port-Feld an.)

Hinweis: Dieser Kanal ist auf Seiten der Violet weder verschlüsselt noch
authentifiziert — daher nur im LAN nutzen, niemals den Port ins Internet
weiterleiten. Er liefert Homey ausschließlich eine Benachrichtigung und kann den
Pool nicht steuern.

## Fehlerbehebung / FAQ

- **`violet.local` löst nicht auf** — die Violet meldet sich nicht in jedem
  Netzwerk per mDNS. Stattdessen die IP-Adresse verwenden (idealerweise eine
  statische).
- **Manche Kacheln fehlen** — das ist normal, wenn dein Regler diese Ausstattung
  nicht meldet; bei Bedarf die Funktionsgruppen-Einstellungen oben prüfen.
- **pH/Redox/Chlor zeigen direkt nach dem Start „-"** — die App vertraut diesen
  Werten erst, nachdem die Pumpe eine Weile umgewälzt hat (einstellbare
  „Pumpen-Einlaufzeit"), da ein stehender Fühler nicht repräsentativ ist.
- **BADU Blue vs. Violet** — identische Hardware, identische Einrichtung; diese
  Anleitung gilt für beide.
- Bug gefunden oder eine Idee für ein Feature? Einfach in diesem Thema antworten.

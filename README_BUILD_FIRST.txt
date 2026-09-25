RYZE CAPTION TOOL — V1.0.7 WINDOWS BUILDER / RELEASE CANDIDATE

Ovo je builder sa kompletnim source kodom i originalnim V3/V5/Stroke MOGRT-ovima.
Nije unapred kompajliran niti runtime-potvrdjen produkcijski EXE.

NA TVOM WINDOWS RACUNARU (jednom za osobu koja pravi installer):
1. Raspakuj CEO ZIP u obican folder. Ne pokreci iz ZIP-a.
2. Instaliraj Node.js LTS i Inno Setup 6.3 ili noviji.
   https://nodejs.org/en/download
   https://jrsoftware.org/isdl.php
3. Preuzmi aktuelni WINDOWS ZXPSignCmd iz Adobe repozitorijuma:
   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
   Adobe preporucuje potpisivanje Windows ZXP-a na Windowsu.
4. Dvoklik BUILD.cmd. Unesi putanju do ZXPSignCmd.exe kada je zatrazi.
   Ako Inno Setup nije pronadjen, unesi putanju do ISCC.exe.
5. Za CEP .p12 sertifikat: unesi svoj vazeci sertifikat, ILI pritisni Enter
   da builder napravi NOV privatni sertifikat. Unesi i sacuvaj lozinku.
   Novi .p12 se cuva izvan ovog foldera, u %LOCALAPPDATA%\RYZE\Signing.
   Ne salji privatni sertifikat niti lozinku timu.
6. Ako sve provere prodju, rezultat je:
   dist\RYZE_Caption_Tool_Setup.exe
   dist\RYZE_Caption_Tool_Setup.exe.sha256

Builder proverava source i MOGRT hash-eve, pokrece regresione testove,
potpisuje CEP, proverava ZXP potpis, pravi CCX kao ZIP po Adobe formatu,
proverava identicnost source-a i paketa i kompajlira Inno installer.
Nema potrebe da rucno pravis CCX u Developer Tools-u.
TSA timestamp korak zahteva internet. Bilo koja greska prekida build.

AKO VEC IMAS STARI BUILDER:
Raspakuj ove fajlove PREKO starog builder foldera i prihvati Replace.
Ne brisi tools ili privatni sertifikat. Pokreni BUILD.cmd ponovo.
Ili koristi ovaj ceo folder i pri buildu navedi stare putanje do alata/sertifikata.

POSLE BUILDA / PROVERA ZA 1.0.7:
1. Sacuvaj projekat, zatvori Premiere i instaliraj novi Setup.exe.
2. Suzi i smanji panel: sadrzaj treba da skroluje, Report bug ostaje dole.
   Otvori kopiju iste sekvence pre prethodnih konverzija.
3. U RYZE panelu izaberi V3 > Convert captions. Sacekaj zavrsetak.
4. Klikni Report bug. TXT treba automatski da se pojavi na Desktopu.
5. Posalji taj TXT. Ovaj izvestaj sadrzi novo merenje ubrzanja.

Panel vise nema test checkbox ni veliki tehnicki log. Report bug cuva TXT
sa greskama i merenjima. Ako helper nije dostupan, otvara se standardni
Save prozor: izaberi Desktop. Izvestaj se ne salje nikome automatski.

1.0.7 proverava originalni timeline na ulasku u svaku sinhronu grupu i posle
svakog obradjenog MOGRT-a. Izmedju importa i izmene teksta proverava izlazne
trake; snimak se ne koristi ponovo posle povratka iz Premiere host poziva.
Rollback, Undo, Scale 80 i zastita postojecih traka ostaju.

NAPOMENE:
- Ovo je kompletan builder, ne unapred kompajliran EXE.
- Lokalni Node testovi prolaze; Windows/Premiere izvrsavanje treba proveriti.
- Ne tvrdimo novo procentualno ubrzanje pre merenja na istoj sekvenci.
- Podrazumevani EXE je nepotpisani preview. Za Windows potpis vidi SECURITY_REVIEW.txt.
- Build sada pravi i dist\RYZE_RELEASE_VERIFICATION.json sa tacnim hashom/statusom.
- Privatni .p12 i lozinka ne idu timu. Tim dobija samo Setup.exe.
- Prekinute konverzije i dalje blokiraju automatsko nastavljanje.
- Procitaj README_TEAM.txt i RELEASE_STATUS.md za granice ove verzije.

1.0.7: ogranicena visina panela, zaseban scroll i stalno dostupna donja traka
Report bug / Retry connection. Konverzija i Undo nisu menjani.
Za antivirus nalaz i potpisivanje procitaj SECURITY_REVIEW.txt.

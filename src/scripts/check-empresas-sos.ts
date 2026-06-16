import { db } from "@/lib/db";
import { profile } from "@/drizzle/schema";
import { inArray } from "drizzle-orm";

const empresas = [
  { nombre: "Admip SRL", cuit: "30707920056" },
  { nombre: "Artzeinu x2 S.A.", cuit: "30719153255" },
  { nombre: "Avz S.R.L.", cuit: "30718726340" },
  { nombre: "Berns Sebastian Matias", cuit: "20259968012" },
  { nombre: "Besorot Tovot S.A.", cuit: "30719305535" },
  { nombre: "Brique Construcciones S.R.", cuit: "30715944029" },
  { nombre: "Carballo Fabian Alberto", cuit: "20180955454" },
  { nombre: "Carniceria Brothers x2 S.a", cuit: "33717904309" },
  { nombre: "Casvin, Cristian Andres", cuit: "20349758610" },
  { nombre: "Chirin", cuit: "30718161394" },
  { nombre: "Diaz Miguens Fernando Este", cuit: "20235093287" },
  { nombre: "E-presis S.A.", cuit: "30717554864" },
  { nombre: "Flor de Azar S.A.", cuit: "33719196239" },
  { nombre: "Gastrotecno S.A.", cuit: "30718074785" },
  { nombre: "Gb Bazar SA", cuit: "30716206404" },
  { nombre: "Gb Metal SA", cuit: "30716135124" },
  { nombre: "Green Safety", cuit: "30718394682" },
  { nombre: "Hdx Grupo", cuit: "33718970089" },
  { nombre: "Hernan Joaquin", cuit: "20249628116" },
  { nombre: "Hexacom SA", cuit: "30643202812" },
  { nombre: "Iriarte, Joaquin Ramon", cuit: "23251342199" },
  { nombre: "J Ame Poderosa SA", cuit: "30717679845" },
  { nombre: "Kasur Lipat", cuit: "30719184835" },
  { nombre: "Khiro S.A.", cuit: "30717680568" },
  { nombre: "Master Kids S.A.", cuit: "30718524551" },
  { nombre: "Max Buddy SA", cuit: "30717605663" },
  { nombre: "Maximov, Mabel Amelia", cuit: "27175689937" },
  { nombre: "Maximvs S.r.l", cuit: "30718958934" },
  { nombre: "Mazal Dream SA", cuit: "30718323386" },
  { nombre: "Messenger & Consulting SA", cuit: "30717548767" },
  { nombre: "Metagame S.A.", cuit: "30718374142" },
  { nombre: "Momel S.r.l", cuit: "30714871087" },
  { nombre: "Mr Almohada Factory S.A.", cuit: "33718009419" },
  { nombre: "Mr Factory Couch SA", cuit: "30717679136" },
  { nombre: "Ngvs", cuit: "30717786986" },
  { nombre: "Pahue Technologies SA", cuit: "30719105056" },
  { nombre: "Pnr Trade S.A.", cuit: "30718922565" },
  { nombre: "Rojot S.A.", cuit: "30716753251" },
  { nombre: "Sabenumitubeja S.A.", cuit: "30718310519" },
  { nombre: "Salem, Jose Edgardo", cuit: "20127571083" },
  { nombre: "Selem David Javier", cuit: "20231269879" },
  { nombre: "Semeca Ingenieria SRL", cuit: "30715433490" },
  { nombre: "Sigana S.A.", cuit: "30718149874" },
  { nombre: "Smart Solution SRL", cuit: "30714871508" },
  { nombre: "Tarrab, Jacobo Leandro", cuit: "20308861210" },
  { nombre: "Termomecanica Valtri S.a", cuit: "30716025752" },
  { nombre: "Toloki", cuit: "30716787407" },
  { nombre: "Ureshi Group S.A.", cuit: "33718399799" },
  { nombre: "Zahrah S.A.", cuit: "30718084209" },
];

const cuits = empresas.map(e => e.cuit);
const profiles = await db.select({
  id: profile.id,
  name: profile.name,
  identityNumber: profile.identityNumber,
}).from(profile).where(inArray(profile.identityNumber, cuits));

const profileMap = new Map(profiles.map(p => [p.identityNumber, p]));

console.log("\n=== CUADRO DE EMPRESAS ===\n");
console.log("Empresa (SOS) | CUIT | En sistema | ID sistema | Nombre en sistema");
console.log("---|---|---|---|---");
for (const e of empresas) {
  const found = profileMap.get(e.cuit);
  const enSistema = found ? "true" : "false";
  const id = found?.id || "-";
  const nombreSistema = found?.name || "-";
  console.log(`${e.nombre} | ${e.cuit} | ${enSistema} | ${id} | ${nombreSistema}`);
}

console.log(`\nTotal: ${empresas.length} empresas, ${profiles.length} encontradas en sistema`);
process.exit(0);

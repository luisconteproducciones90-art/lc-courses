'use strict';
// Datos 100% FICTICIOS para el modo demo.
const base = ['search_knowledge', 'handoff_to_human'];
module.exports = {
  company: {
    name: 'Ferretería El Tornillo (demo)', legal: 'El Tornillo S.R.L. (ficticia)',
    description: 'Ferretería de barrio ficticia con herramientas, materiales eléctricos, pinturas y sanitarios. Datos de ejemplo para probar LC-AI BUSINESS.',
    address: 'Av. Ejemplo 1234, Ciudad Demo', phone: '011 5555-0000', whatsapp: '+54 9 11 5555-0000', email: 'hola@eltornillo.example', website: 'https://eltornillo.example',
    hours: 'Lunes a viernes de 8:00 a 18:00. Sábados de 8:00 a 13:00. Domingos cerrado.',
    services: 'Venta mostrador, envíos a domicilio en la ciudad, corte de maderas a medida, asesoramiento técnico.',
    policies: 'Cambios dentro de los 15 días con ticket y producto sin uso. Garantía de herramientas eléctricas: 12 meses. Envíos sin cargo en compras superiores a $80.000.',
    faq: '¿Aceptan tarjetas? Sí, débito y crédito en hasta 3 cuotas sin interés. ¿Hacen envíos? Sí, dentro de la ciudad en 24 a 48 horas.',
  },
  docs: [
    { title: 'Catálogo y precios (ficticio)', csv: true, content: `producto,marca,codigo,precio,stock
Taladro percutor 650W,Bosch,TAL-650B,89900,12
Taladro percutor 500W,Black+Decker,TAL-500BD,64500,7
Amoladora angular 4.5 pulgadas,Dewalt,AMO-45D,78900,5
Atornillador inalámbrico 12V,Makita,ATO-12M,112000,0
Juego de mechas 19 piezas,Bosch,MEC-19B,18700,40
Pintura látex interior 20L,Alba,PIN-L20A,96400,9
Rodillo lana 22cm,Tigre,ROD-22T,4300,60
Cinta métrica 5m,Stanley,CIN-5S,5800,35
Disyuntor bipolar 25A,Schneider,DIS-25S,14200,18
Cable unipolar 2.5mm rollo 100m,Pirelli,CAB-25P,58000,6` },
    { title: 'Políticas de la tienda (ficticio)', content: `Cambios y devoluciones: se aceptan dentro de los 15 días corridos con el ticket y el producto sin uso y en su caja original.

Garantía: herramientas eléctricas 12 meses por defectos de fábrica. No cubre mal uso ni desgaste.

Envíos: dentro de la ciudad en 24 a 48 horas hábiles. Sin cargo para compras superiores a $80.000. Debajo de ese monto, el envío cuesta $3.500.

Medios de pago: efectivo (10% de descuento), débito, crédito en hasta 3 cuotas sin interés y transferencia.

Presupuestos: se realizan sin cargo y tienen validez de 7 días. Para obras grandes, un asesor prepara el presupuesto personalizado.` },
    { title: 'Informe gerencial del mes (ficticio)', content: `Resumen del mes de octubre (datos ficticios):

Ventas totales: $18.450.000, un 7% más que septiembre. Ticket promedio: $41.200. Cantidad de ventas: 448.

Categorías más vendidas: herramientas eléctricas (34%), pinturas (22%), materiales eléctricos (19%), sanitarios (12%), otros (13%).

Productos con stock bajo: Atornillador inalámbrico Makita sin stock; Amoladora Dewalt con 5 unidades; Cable unipolar con 6 rollos.

Clientes nuevos: 62. Clientes que no compran hace más de 30 días: 140. Conversaciones atendidas por el asistente: 311, de las cuales 38 se derivaron a una persona.

Recomendaciones: reponer los productos con stock bajo, lanzar una campaña de reactivación para los clientes inactivos y reforzar el horario de atención del sábado por la mañana.` },
  ],
  agents: [
    { name: 'Sofía — Ventas', type: 'sales', avatar: '💰', description: 'Te ayuda a elegir y comprar.', personality: 'Amable, profesional y persuasiva.', tone: 'cercano', objective: 'Convertir consultas en ventas.', rules: ['Nunca inventar precios ni stock.', 'Si el cliente quiere comprar, ofrecer derivarlo con un vendedor.'], welcome: '¡Hola! Soy Sofía, de Ferretería El Tornillo (demo). ¿Qué estás buscando?', tools: base },
    { name: 'Tomás — Atención', type: 'attention', avatar: '🤖', description: 'Responde dudas sobre horarios, envíos y políticas.', personality: 'Paciente y claro.', tone: 'amable', objective: 'Resolver consultas generales.', welcome: '¡Hola! Soy Tomás. Preguntame por horarios, envíos, garantías o medios de pago.', tools: base },
    { name: 'Nico — Stock', type: 'stock', avatar: '📦', description: 'Consulta productos, disponibilidad y precios.', personality: 'Preciso y directo.', tone: 'directo', objective: 'Informar disponibilidad y precios reales.', rules: ['Nunca inventar precios ni stock.'], welcome: 'Hola, soy Nico. Decime qué producto buscás (ej: "¿Tenés taladro Bosch?").', tools: base },
    { name: 'Clara — Gerencial', type: 'manager', avatar: '📊', description: 'Resume el negocio y sugiere acciones.', personality: 'Analítica y sintética.', tone: 'ejecutivo', objective: 'Analizar la información cargada del negocio.', welcome: 'Hola, soy Clara. Puedo resumirte ventas, stock bajo y clientes del mes.', tools: ['search_knowledge'] },
  ],
};

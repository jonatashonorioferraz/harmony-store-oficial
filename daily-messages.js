(()=>{
const messages=Object.freeze([
  'Cada detalhe feito com carinho transforma uma peça em algo especial.',
  'Seu talento faz parte da história que a Harmony Store está construindo.',
  'Hoje é um ótimo dia para criar coisas lindas.',
  'Um passo de cada vez também constrói grandes sonhos.',
  'Seu trabalho feito à mão leva carinho para muitas pessoas.',
  'A beleza mora nos detalhes que recebem a sua atenção.',
  'Que o seu dia tenha leveza, criatividade e bons motivos para sorrir.',
  'Tudo o que é feito com propósito carrega um brilho diferente.',
  'Sua dedicação dá vida a ideias que antes existiam apenas no papel.',
  'Criar com as mãos é também colocar um pedacinho do coração no mundo.',
  'Você não precisa fazer tudo de uma vez; basta continuar com carinho.',
  'Que hoje não faltem inspiração, tranquilidade e um cafezinho por perto.',
  'O cuidado que você coloca no processo aparece no resultado.',
  'Pequenos avanços de hoje se transformam em grandes conquistas amanhã.',
  'Seu olhar cuidadoso torna cada criação verdadeiramente única.',
  'Respire fundo, organize o cantinho e deixe a criatividade acontecer.',
  'Existe muita força em quem transforma matéria-prima em memória afetiva.',
  'Seu capricho ajuda a tornar momentos simples em lembranças especiais.',
  'Que o trabalho de hoje seja leve e traga orgulho ao final do dia.',
  'Toda criação começa com uma ideia e cresce com dedicação.',
  'Você é parte importante de cada encomenda que ganha vida por aqui.',
  'Produção organizada, coração tranquilo e criatividade em movimento.',
  'Seu ritmo também é um bom ritmo. Continue fazendo o seu melhor.',
  'As mãos criam, o cuidado transforma e o carinho faz a diferença.',
  'Que hoje você encontre beleza até nas pequenas tarefas.',
  'Cada peça concluída carrega uma história de dedicação.',
  'Seu trabalho importa e contribui para algo muito bonito.',
  'Um dia produtivo também pode ser um dia leve e gentil.',
  'Criatividade floresce quando damos espaço para respirar e experimentar.',
  'A constância transforma sonhos delicados em resultados incríveis.',
  'Que a inspiração encontre você no meio dos detalhes de hoje.',
  'Você ajuda a espalhar carinho em forma de lembrança.',
  'Hoje pode ser simples, bonito e cheio de pequenas conquistas.',
  'O seu toque pessoal é o que torna cada criação inesquecível.',
  'Tenha paciência com o processo; coisas lindas levam cuidado.',
  'Seu talento merece ser celebrado em cada etapa do caminho.',
  'Que a sua bancada seja um lugar de ideias felizes hoje.',
  'Quando carinho e capricho trabalham juntos, o resultado encanta.',
  'Você transforma cores, formas e aromas em momentos especiais.',
  'Não subestime a força de uma tarefa bem-feita e de um coração tranquilo.',
  'Que hoje sobre criatividade e falte apenas espaço na bancada.',
  'Seu cuidado é percebido mesmo nos detalhes que ninguém consegue explicar.',
  'Cada nova produção é mais uma página bonita da nossa história.',
  'Faça com calma, faça com carinho e confie no que você sabe criar.',
  'O artesanal tem alma porque passa pelas mãos de pessoas como você.',
  'Que o dia renda bons sorrisos, belas peças e orgulho do seu trabalho.',
  'Sua criatividade merece espaço para experimentar novas possibilidades.',
  'Toda grande realização já foi um pequeno começo cheio de esperança.',
  'O seu melhor de hoje não precisa ser igual ao de ontem — e está tudo bem.',
  'Que cada etapa concluída traga aquela gostosa sensação de missão cumprida.',
  'Seu trabalho ajuda sonhos e celebrações a ganharem forma.',
  'Organização é carinho com o seu tempo e com a sua criatividade.',
  'Há beleza em construir algo especial, uma peça de cada vez.',
  'Que o seu talento encontre hoje novas formas de surpreender você mesma.',
  'Criar também é acreditar que uma ideia pode se tornar realidade.',
  'O carinho colocado nas mãos sempre encontra um jeito de aparecer.',
  'Você faz parte de uma equipe que transforma dedicação em encanto.',
  'Que hoje seja um daqueles dias leves que deixam o coração contente.',
  'Sua presença, seu cuidado e seu talento fazem diferença por aqui.',
  'Comece com confiança: coisas bonitas estão esperando para ganhar vida.'
]);

function dateIndex(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  const day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
  return ((day%messages.length)+messages.length)%messages.length;
}

function messageForDate(value=new Date()){return messages[dateIndex(value)]}
function greetingForDate(value=new Date()){
  const date=value instanceof Date?value:new Date(value),hour=date.getHours();
  return hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
}

window.HarmonyDaily=Object.freeze({messages,dateIndex,messageForDate,greetingForDate});
})();

# 6 AVALIAÇÃO E RESULTADOS

Este capítulo apresenta os resultados obtidos nos ensaios de benchmarking e a validação estatística inferencial dos dados coletados. A exposição inicia pela caracterização do conjunto de dados e pela verificação dos pressupostos que sustentam os testes aplicados, pois a validade dos valores de significância reportados adiante depende dessas condições. Em seguida, cada família de métricas prevista na seção 2.4.1 é analisada separadamente: tempo de resposta, vazão, taxa de erros e consumo de recursos computacionais. Por fim, a análise é desagregada por operação, procedimento que revela um comportamento não observável nos indicadores agregados e que se mostrou determinante para a resposta à questão de pesquisa.

## 6.1 Delineamento experimental e conjunto de dados

Os ensaios seguiram um delineamento fatorial completo com três fatores. O primeiro, arquitetura, apresenta dois níveis: monólito unificado e ecossistema de microsserviços. O segundo, intensidade de carga, apresenta três níveis correspondentes aos cenários descritos na seção 3.5: Normal, com 50 usuários virtuais; Dia Corrido, com 150; e Emergencial, com 300. O terceiro fator, máquina hospedeira, apresenta dois níveis e decorre da replicação prevista na seção 4.6, destinada a verificar se as conclusões sobrevivem à troca do perfil de hardware. A combinação desses fatores produz doze células experimentais, cada uma replicada cinco vezes, totalizando sessenta observações independentes.

As duas máquinas hospedeiras apresentam perfis de processamento distintos. A primeira, identificada como *notebook*, dispõe de processador Intel Core i5-8350U com oito processadores lógicos; a segunda, identificada como *desktop*, de processador AMD Ryzen 7 5700G com dezesseis. Ambas executaram os ensaios com a máquina virtual do Docker configurada com oito núcleos e aproximadamente 7,7 GB de memória, de modo que o orçamento de recursos imposto às pilhas, descrito na seção 5.4, permaneceu idêntico e vinculante nos dois ambientes. As campanhas foram conduzidas em 1º e 7 de outubro de 2026, ambas sob a mesma versão dos protótipos, o que elimina a possibilidade de confundimento entre o fator máquina e eventuais alterações de implementação.

A unidade experimental adotada é a rodada completa de teste, e não a requisição individual. Essa definição decorre de uma limitação intrínseca ao instrumento de medição: a ferramenta Grafana k6 consolida o resultado de cada execução em um sumário agregado, de modo que os percentis e as médias derivam todos do mesmo conjunto de requisições e não constituem medidas independentes entre si. A replicação, portanto, provém da repetição da mesma condição experimental, que é exatamente o que o Teste t e a Análise de Variância exigem para estimar o erro amostral.

Quatro procedimentos foram adotados para preservar a validade interna do experimento. Primeiro, a ordem de execução das rodadas foi aleatorizada dentro de cada campanha por meio de um gerador pseudoaleatório com semente fixa, declarada no registro de execução. A execução em blocos, na qual todas as rodadas de uma arquitetura precederiam as da outra, confundiria o efeito da arquitetura com efeitos temporais, a exemplo do aquecimento progressivo do processador e da variação de processos de segundo plano; a aleatorização distribui esses efeitos entre as células, e a semente fixa preserva a reprodutibilidade. Segundo, as bases de dados relacional e não relacional foram integralmente truncadas antes de cada rodada, impedindo que o volume acumulado de registros de uma execução anterior influenciasse o desempenho da seguinte. Terceiro, rodadas interrompidas, incompletas ou com volume de amostras inferior ao mínimo estabelecido foram descartadas automaticamente e repetidas, de maneira que nenhuma execução parcial ingressasse no conjunto de dados. Das sessenta rodadas planejadas, sessenta foram validadas e nenhuma foi descartada. Quarto, cada observação registra o perfil da máquina que a produziu, o que torna o fator hospedeiro explícito na análise em vez de dissolvido no erro amostral.

## 6.2 Verificação dos pressupostos

O Teste t e a Análise de Variância assumem independência entre as observações, homogeneidade aproximada das variâncias e normalidade dos resíduos. A independência decorre do próprio protocolo, já que cada rodada é executada sobre bases zeradas e em ordem sorteada. As duas demais condições foram verificadas empiricamente e determinaram a estrutura de análise adotada neste capítulo.

A dispersão interna das células foi avaliada pelo coeficiente de variação. Para o tempo de resposta médio em escala bruta, os coeficientes situaram-se entre 10,1% e 32,2% no notebook e entre 1,1% e 6,8% no desktop. Essa heterogeneidade é esperada em métricas de latência, cujo desvio-padrão tende a crescer proporcionalmente à média, violando o pressuposto de homocedasticidade. Adotou-se, por essa razão, a transformação logarítmica natural da variável-resposta para as análises inferenciais de tempo de resposta, procedimento consolidado na literatura de engenharia de desempenho por estabilizar a variância e aproximar a distribuição dos resíduos da normal. Após a transformação, os coeficientes de variação reduziram-se à faixa de 1,1% a 5,0% no notebook e de 0,1% a 0,9% no desktop, indicando medição controlada em ambos os ambientes.

A comparação entre os dois ambientes, contudo, revela uma diferença de estabilidade de medição que condiciona o tratamento estatístico subsequente. Ainda em escala logarítmica, a variância interna das células do notebook supera a das células correspondentes do desktop por fatores entre 10,6 e 114,1, e a razão entre a maior e a menor variância do conjunto das doze células alcança 850. A explicação mais plausível é a limitação térmica do processador móvel sob carga sustentada, que introduz variação de desempenho ausente no processador de mesa. Qualquer que seja a causa, a consequência estatística é a mesma: a Análise de Variância tolera razões de variância da ordem de três a quatro em delineamentos balanceados, e o valor observado excede largamente essa faixa.

O diagnóstico de normalidade dos resíduos aponta na mesma direção. Analisadas separadamente, as duas campanhas satisfazem o pressuposto: o notebook apresenta assimetria de 0,08 e curtose de −0,26, e o desktop, assimetria de −0,61 e curtose de −0,34, valores contidos no intervalo compatível com a distribuição normal. O conjunto combinado, entretanto, apresenta assimetria de 0,99, fora desse intervalo — resultado esperado quando se agrupam duas distribuições de dispersões acentuadamente distintas. Optou-se por não aplicar o teste de Shapiro-Wilk, uma vez que seu poder estatístico é reduzido nesta ordem de grandeza amostral e detectaria apenas desvios grosseiros, ao passo que os coeficientes de forma associados ao gráfico quantil-quantil permitem identificar a natureza do desvio — cauda pesada ou assimetria — de maneira inspecionável.

Dessa verificação decorre a estrutura de análise adotada. A inferência principal deste capítulo apoia-se no **Teste t de Welch aplicado separadamente a cada máquina**, procedimento que não assume homogeneidade de variâncias e cujos pressupostos são integralmente satisfeitos dentro de cada campanha. A concordância entre os dois ambientes passa, assim, a constituir a evidência de robustez: um resultado que se reproduz em dois perfis de hardware independentes sustenta conclusão mais sólida do que um valor de significância obtido do agrupamento. A Análise de Variância de três fatores sobre o conjunto combinado é reportada como análise complementar, destinada a quantificar a estrutura fatorial e os tamanhos de efeito, com a ressalva de heterogeneidade de variâncias explicitada. O delineamento manteve-se balanceado, com cinco observações em cada uma das doze células. Todos os testes adotam nível de significância de 5%.

## 6.3 Tempo de resposta

A Tabela 1 apresenta as estatísticas descritivas do tempo médio de resposta, em escala bruta, para as seis células experimentais em cada máquina hospedeira.

**Tabela 1 – Tempo médio de resposta por arquitetura, cenário e máquina (n = 5)**

| Arquitetura | Cenário | Notebook (ms) | Desktop (ms) | Conjunto (ms) |
|---|---|---|---|---|
| Monólito | Normal | 458 | 258 | 358 |
| Monólito | Dia Corrido | 2.919 | 1.994 | 2.457 |
| Monólito | Emergencial | 5.928 | 4.649 | 5.289 |
| Microsserviços | Normal | 2.105 | 1.570 | 1.838 |
| Microsserviços | Dia Corrido | 7.301 | 6.457 | 6.879 |
| Microsserviços | Emergencial | 14.012 | 12.156 | 13.084 |

Fonte: elaborada pelos autores, 2026.

O monólito registrou tempos de resposta inferiores aos do ecossistema de microsserviços em todas as seis células de ambas as máquinas, sem exceção. Os percentis de cauda do conjunto confirmam o padrão: sob carga Emergencial, o p95 é de 22.154 ms no monólito contra 49.223 ms nos microsserviços, e o p99, de 28.100 ms contra 52.343 ms.

A Tabela 2 apresenta o Teste t de Welch aplicado à variável-resposta transformada, separadamente em cada campanha.

**Tabela 2 – Teste t de Welch sobre o tempo de resposta em escala logarítmica, por máquina**

| Máquina | Cenário | Razão MS/Monólito | t | gl | p | d de Cohen |
|---|---|---|---|---|---|---|
| Notebook | Normal | 4,65× | −8,67 | 7,75 | < 0,0001 | −5,48 |
| Notebook | Dia Corrido | 2,49× | −7,94 | 7,93 | < 0,0001 | −5,02 |
| Notebook | Emergencial | 2,39× | −8,77 | 6,11 | 0,0001 | −5,54 |
| Desktop | Normal | 6,09× | −51,18 | 6,36 | < 0,0001 | −32,37 |
| Desktop | Dia Corrido | 3,24× | −35,95 | 7,97 | < 0,0001 | −22,74 |
| Desktop | Emergencial | 2,61× | −101,74 | 6,34 | < 0,0001 | −64,34 |

Fonte: elaborada pelos autores, 2026.

A hipótese nula de igualdade entre as médias é rejeitada em todos os seis contrastes, nas duas máquinas e nos três níveis de carga. Adotou-se a correção de Welch em lugar do Teste t de Student clássico porque as variâncias dos dois grupos diferem entre si, condição na qual a versão clássica subestima o erro-padrão. Os tamanhos de efeito excedem em larga medida o limiar convencional de 0,8 para efeito grande; as magnitudes observadas no desktop decorrem da variância interna muito reduzida daquele ambiente e devem ser lidas como indicativo de medição estável, não como grandeza comparável às do notebook.

Dois aspectos merecem registro. Primeiro, a diferença relativa entre as arquiteturas **decresce monotonicamente com o aumento da carga** nas duas máquinas, de 4,65× para 2,39× no notebook e de 6,09× para 2,61× no desktop. Segundo, a vantagem do monólito é sistematicamente maior no desktop, ambiente de maior capacidade de processamento. As duas observações convergem para a mesma leitura: o monólito aproveita melhor a folga de recursos, e essa vantagem se estreita à medida que ambas as arquiteturas se aproximam da saturação.

A Análise de Variância de três fatores sobre o conjunto combinado, apresentada na Tabela 3, decompõe a variação total observada.

**Tabela 3 – ANOVA de três fatores para o tempo de resposta, em escala logarítmica (N = 60)**

| Fonte de variação | gl | F | p | η²p |
|---|---|---|---|---|
| Arquitetura | 1 | 925,46 | < 0,0001 | 0,951 |
| Carga | 2 | 1.233,26 | < 0,0001 | 0,981 |
| Máquina | 1 | 47,97 | < 0,0001 | 0,500 |
| Arquitetura × Carga | 2 | 34,37 | < 0,0001 | 0,589 |
| Arquitetura × Máquina | 1 | 6,72 | 0,0126 | 0,123 |
| Carga × Máquina | 2 | 2,79 | 0,0716 | 0,104 |
| Arquitetura × Carga × Máquina | 2 | 0,54 | 0,5872 | 0,022 |
| Resíduo | 48 | — | — | — |

Fonte: elaborada pelos autores, 2026.

Os três efeitos principais são significativos. A arquitetura e a intensidade de carga apresentam tamanhos de efeito parciais elevados, de 0,951 e 0,981 respectivamente; o fator máquina, embora significativo, responde por parcela menor da variação, com η²p de 0,500. A interação entre arquitetura e carga é significativa e corrobora o estreitamento da diferença relativa descrito anteriormente.

O termo **Arquitetura × Máquina**, significativo a p = 0,0126 com η²p de 0,123, é o que a replicação existe para avaliar. Sua significância indica que a *magnitude* da vantagem do monólito varia conforme o hardware, como já evidenciavam as razões da Tabela 2. Não indica, contudo, inversão de sentido: o monólito prevalece nas seis células de ambas as máquinas, e a interação tripla não é significativa (p = 0,5872), o que afasta a hipótese de que o padrão de resposta à carga difira entre os ambientes. Em outras palavras, a conclusão é robusta à troca de hardware; apenas o tamanho do efeito não o é.

Convém reiterar que esta tabela está sujeita à heterogeneidade de variâncias documentada na seção 6.2, razão pela qual os valores de significância nela reportados devem ser lidos como confirmatórios da análise por máquina, e não como sua substituição.

O teste post-hoc de Tukey HSD, aplicado às quinze comparações par a par entre as seis combinações de arquitetura e carga, utiliza o quadrado médio residual do modelo de três fatores — o termo de erro do modelo correto, uma vez que o resíduo do modelo de dois fatores incorporaria a variação entre máquinas e produziria faixa de significância artificialmente ampla. Com q crítico de 4,197 para 48 graus de liberdade e diferença mínima significativa de 0,2046 na escala logarítmica, as três comparações que confrontam as arquiteturas sob o mesmo nível de carga são significativas a p < 0,0001. O procedimento de Tukey foi adotado em substituição a testes t independentes porque quinze comparações simultâneas ao nível de 5% produziriam, apenas por efeito do acaso, aproximadamente um falso positivo.

## 6.4 Vazão

A Tabela 4 apresenta a vazão média, medida em requisições concluídas por segundo.

**Tabela 4 – Vazão por arquitetura e cenário de carga (conjunto, n = 10 por célula)**

| Arquitetura | Normal | Dia Corrido | Emergencial |
|---|---|---|---|
| Monólito | 31,27 | 37,14 | 36,01 |
| Microsserviços | 15,19 | 15,29 | 14,73 |

Fonte: elaborada pelos autores, 2026.

A Análise de Variância de três fatores indica efeito significativo da arquitetura (F = 990,15; p < 0,0001), da carga (F = 8,02; p = 0,0010), da máquina (F = 56,90; p < 0,0001) e das interações entre arquitetura e carga (F = 8,55; p = 0,0007) e entre arquitetura e máquina (F = 16,96; p = 0,0001).

O comportamento das duas arquiteturas diante do aumento de carga difere qualitativamente, e é esse contraste que a interação entre arquitetura e carga capta. O monólito eleva a vazão em 18,8% entre os cenários Normal e Dia Corrido, ainda que não a sustente integralmente no cenário Emergencial, onde recua para 36,01 req/s. Os microsserviços permanecem praticamente constantes nos três cenários, com variação inferior a 4% entre o maior e o menor valor. A leitura decorrente é que **os microsserviços já operam em saturação sob a carga mais branda do delineamento**, ao passo que o monólito dispõe de folga até o cenário intermediário.

Essa constatação exige uma ressalva metodológica que este trabalho entende necessário explicitar. O ensaio adota modelo de laço fechado: cada usuário virtual emite uma requisição, aguarda a resposta completa, observa um intervalo de reflexão de um segundo e só então emite a requisição seguinte. Nessa configuração, a vazão não é uma variável imposta pelo pesquisador, e sim uma resposta do sistema sob teste. Sob saturação, a vazão aproxima-se do quociente entre a concorrência efetiva e o tempo de ciclo, de modo que latência e vazão deixam de constituir evidências independentes. Sob carga Emergencial, a razão de latência entre as arquiteturas é de 2,50 e a razão de vazão, de 2,44 — valores praticamente coincidentes. As duas métricas são genuinamente independentes apenas fora da saturação, condição na qual as razões de fato divergem: sob carga Normal, 5,32 contra 2,06. Reportar ambas como vitórias independentes do monólito sob carga Emergencial significaria contabilizar duas vezes o mesmo fenômeno.

## 6.5 Taxa de erros

A taxa de erros manteve-se em 0,00% em onze das doze células experimentais. Registrou-se ocorrência de falhas exclusivamente na célula microsserviços sob carga Emergencial, com média de 1,99% e desvio-padrão de 3,02% no conjunto das duas máquinas.

Esta métrica é reportada em caráter estritamente descritivo. A aplicação de inferência sobre um conjunto em que onze das doze células apresentam variância nula não é defensável: os valores de F produzidos pela Análise de Variância tornam-se artefatos matemáticos decorrentes da existência de uma única célula não degenerada, e o diagnóstico de normalidade dos resíduos acusa desvio acentuado do intervalo compatível com a distribuição normal. Conclui-se que, embora as falhas tenham ocorrido exclusivamente na arquitetura de microsserviços sob a carga mais severa, o número de replicações disponível não sustenta afirmação inferencial a respeito, e a diferença deve ser tratada como indício que demanda replicação adicional. Registre-se que a ocorrência é consistente com a saturação do serviço de atendimentos documentada na seção 6.6.

## 6.6 Consumo e aproveitamento de recursos computacionais

Ambas as arquiteturas operaram sob orçamento idêntico de recursos, declarado nos arquivos de orquestração de contêineres e totalizando 4,0 núcleos de processamento e 3.072 MB de memória por pilha. Essa isonomia é condição necessária para que a comparação de consumo tenha sentido.

Sob carga Emergencial, o monólito consumiu em média 1,577 núcleos, equivalentes a 39,4% do orçamento disponível, ao passo que os microsserviços consumiram 0,671 núcleos, ou 16,8%.

Uma leitura superficial desses valores sugeriria maior eficiência dos microsserviços. O cálculo da vazão por núcleo consumido, apresentado na Tabela 5, demonstra que essa interpretação é incorreta.

**Tabela 5 – Aproveitamento do orçamento de recursos sob carga Emergencial**

| Arquitetura | Vazão (req/s) | CPU consumida (núcleos) | Vazão por núcleo | Percentual do orçamento |
|---|---|---|---|---|
| Monólito | 36,01 | 1,577 | 22,83 | 39,4% |
| Microsserviços | 14,73 | 0,671 | 21,94 | 16,8% |

Fonte: elaborada pelos autores, 2026.

As duas arquiteturas convertem processamento em trabalho útil praticamente na mesma proporção: 22,83 contra 21,94 requisições por segundo por núcleo. Os microsserviços não são menos eficientes com o processamento que utilizam; eles não conseguem utilizá-lo. A distinção entre eficiência e capacidade de recrutamento é essencial para a correta interpretação do resultado.

O detalhamento por contêiner, apresentado na Tabela 6, localiza a origem dessa limitação.

**Tabela 6 – Consumo de CPU por contêiner sob carga Emergencial, em relação ao limite declarado**

| Pilha | Contêiner | CPU média (núcleos) | Limite | % do limite (média) | % do limite (pico) |
|---|---|---|---|---|---|
| Monólito | app_nestjs_monolito | 1,189 | 2,0 | 59% | 93% |
| Monólito | db_mongo_monolito | 0,317 | 1,0 | 32% | 55% |
| Monólito | db_postgres_monolito | 0,071 | 1,0 | 7% | 41% |
| Microsserviços | ms_atendimentos | 0,293 | 0,3 | 98% | 110% |
| Microsserviços | ms_consultas_laudos | 0,154 | 0,3 | 51% | 97% |
| Microsserviços | api_gateway | 0,050 | 0,2 | 25% | 75% |
| Microsserviços | ms_auditoria | 0,049 | 0,3 | 16% | 79% |
| Microsserviços | db_postgres_pep_ms | 0,031 | 1,0 | 3% | 13% |
| Microsserviços | ms_medicos | 0,030 | 0,3 | 10% | 45% |
| Microsserviços | ms_historico_clinicos | 0,028 | 0,3 | 9% | 44% |
| Microsserviços | ms_pacientes | 0,024 | 0,3 | 8% | 54% |
| Microsserviços | db_mongo_ms | 0,013 | 1,0 | 1% | 4% |

Fonte: elaborada pelos autores, 2026.

O serviço `ms_atendimentos` opera a 98% de seu limite em média e atinge 110% nos instantes de pico, condição em que o mecanismo de controle de recursos do sistema operacional passa a estrangular sua execução. Simultaneamente, o serviço de pacientes utiliza 8% de seu limite e a instância não relacional, apenas 1% do seu. O orçamento de quatro núcleos encontra-se, portanto, fragmentado: o caminho crítico da requisição satura contra um teto de 0,3 núcleo enquanto recursos ociosos permanecem alocados a serviços vizinhos, sem possibilidade de transferência. O monólito, concentrando o mesmo trabalho em um único processo com teto de 2,0 núcleos, converte essa folga em desempenho, atingindo 93% de seu limite nos instantes de pico.

Quanto à memória, o monólito apresentou consumo médio crescente com a carga — 442 MB, 529 MB e 618 MB nos cenários Normal, Dia Corrido e Emergencial — enquanto os microsserviços mantiveram-se estáveis em torno de 750 MB nos três cenários. O ecossistema distribuído consome, portanto, mais memória em todos os cenários, resultado esperado dada a replicação do tempo de execução do Node.js em sete processos distintos. O consumo de pico diverge na direção oposta: 883 MB no monólito contra 775 MB nos microsserviços, reflexo da variação de carga concentrada em um único processo. Nenhuma das arquiteturas aproximou-se do limite de 3.072 MB, de modo que a memória não constituiu fator restritivo nos ensaios realizados.

## 6.7 Análise por operação e isolamento de domínios de falha

Todas as análises apresentadas até esta seção utilizam a linha consolidada do relatório de carga, que corresponde à média das cinco operações executadas pelo cenário. A desagregação por operação, apresentada na Tabela 7, revela que essas operações comportam-se de maneiras opostas, informação integralmente suprimida pelo indicador agregado.

**Tabela 7 – Tempo médio de resposta por operação sob carga Emergencial, por máquina**

| Operação | Notebook mono | Notebook MS | Desktop mono | Desktop MS | Melhor desempenho |
|---|---|---|---|---|---|
| GET /pacientes/:id | 623 | 19 | 389 | 15 | Microsserviços |
| POST /medicos | 293 | 26 | 176 | 14 | Microsserviços |
| GET /atendimentos/:id | 5.010 | 20.841 | 3.472 | 18.867 | Monólito |
| GET /atendimentos/medico/:id | 10.365 | 28.856 | 8.358 | 23.558 | Monólito |
| POST /atendimentos | 13.839 | 23.812 | 11.096 | 20.787 | Monólito |

Fonte: elaborada pelos autores, 2026.

Os microsserviços apresentam desempenho superior em duas das cinco operações avaliadas, e **a identificação do vencedor é idêntica nas duas máquinas em todas as cinco operações**, o que confere a este achado o mesmo grau de robustez atribuído aos resultados agregados. A separação entre os dois conjuntos é nítida quanto à sua natureza: as três operações em que o monólito prevalece são precisamente aquelas roteadas ao serviço de atendimentos, saturado conforme demonstrado na seção anterior; as duas em que os microsserviços prevalecem são atendidas por serviços distintos.

O fator de degradação, obtido pela razão entre o tempo de resposta sob carga Emergencial e sob carga Normal dentro de uma mesma arquitetura, esclarece o mecanismo subjacente. Esse indicador compara cada arquitetura consigo mesma e, por essa razão, não é afetado pela comparação entre elas.

**Tabela 8 – Fator de degradação por operação, do cenário Normal ao Emergencial**

| Operação | Notebook mono | Notebook MS | Desktop mono | Desktop MS |
|---|---|---|---|---|
| GET /pacientes/:id | 15,2× | 0,9× | 29,3× | 1,2× |
| POST /medicos | 3,5× | 1,1× | 7,4× | 1,2× |
| GET /atendimentos/:id | 8,7× | 6,8× | 9,0× | 9,0× |
| GET /atendimentos/medico/:id | 11,9× | 8,0× | 16,2× | 9,1× |
| POST /atendimentos | 18,2× | 5,7× | 30,5× | 6,2× |

Fonte: elaborada pelos autores, 2026.

No monólito, a operação de consulta a pacientes tornou-se 15,2 vezes mais lenta entre os cenários Normal e Emergencial no notebook, e 29,3 vezes mais lenta no desktop, ainda que o trabalho computacional executado por ela não tenha se alterado. A taxa de chegada de requisições nessa operação específica elevou-se de 5,7 para 7,3 req/s, acréscimo de aproximadamente 28%, insuficiente para explicar elevações dessa ordem no tempo de resposta. A degradação decorre integralmente da saturação das operações vizinhas: no monólito, as cinco operações compartilham o mesmo processo, o mesmo conjunto de *threads* e o mesmo grupo de conexões com os bancos de dados, de maneira que o esgotamento desses recursos por uma operação propaga-se às demais. Na arquitetura de microsserviços, a mesma operação manteve-se em 0,9× e 1,2×, isto é, não sofreu degradação apreciável, por residir em processo e sob limite de recursos próprios.

O indicador de conformidade com o objetivo de nível de serviço corrobora o achado. Sob carga Emergencial, o monólito atende ao limite estabelecido em 62,1% das consultas a pacientes, contra 100,0% nos microsserviços; em `POST /medicos`, 92,8% contra 99,8%. Nas três operações do caminho composto, ambas as arquiteturas falham amplamente, com o monólito ainda assim em posição superior: 27,0% contra 6,8% em `GET /atendimentos/:id`, por exemplo.

Este resultado responde ainda a uma objeção previsível quanto ao delineamento, segundo a qual o limite de 0,3 núcleo por serviço configuraria desvantagem artificialmente imposta aos microsserviços. Os seis serviços operam sob o mesmo limite, e esse mesmo limite produz tempos de resposta da ordem de dezenas de milissegundos em algumas operações e de dezenas de segundos em outras. O fator determinante não é o valor do limite, mas a concentração de trabalho no serviço responsável pela composição da requisição, que executa três chamadas de rede encadeadas enquanto os demais realizam consulta direta à sua base.

Registra-se, por fim, uma limitação desta análise. Os microsserviços entregam menor vazão agregada e, consequentemente, submeteram cada operação a uma taxa de chegada inferior — 3,33 contra 7,30 req/s na consulta a pacientes sob carga Emergencial. Parte da vantagem observada decorre desse menor volume. A magnitude, contudo, não é explicável por essa diferença: uma razão de 2,2 vezes no volume de requisições não produz uma razão de 33 vezes no tempo de resposta. Ademais, o argumento relativo à degradação interna ao monólito, apresentado nos parágrafos anteriores, não depende da comparação entre as arquiteturas e permanece válido independentemente desse fator.

## 6.8 Síntese dos resultados

A hipótese nula de ausência de diferença de desempenho entre as arquiteturas sob idênticas condições de estresse é rejeitada para o tempo de resposta, a vazão e o consumo de recursos. No caso do tempo de resposta, a rejeição ocorre nos três níveis de carga e **nas duas máquinas hospedeiras independentemente**, com valores de significância iguais ou inferiores a 0,0001. Não é rejeitada para a taxa de erros, por insuficiência de replicações em células não degeneradas.

A replicação em perfis de hardware distintos, prevista na seção 4.6, cumpriu a função a que se destinava. O monólito apresentou menor tempo de resposta nas seis células de ambas as máquinas, e a identificação da arquitetura de melhor desempenho em cada uma das cinco operações foi idêntica nos dois ambientes. A interação entre arquitetura e máquina, embora estatisticamente significativa, manifesta-se como variação de magnitude — a vantagem do monólito é maior no equipamento de maior capacidade — e não como inversão de sentido, o que se confirma pela ausência de significância da interação tripla.

Quanto à questão de pesquisa formulada no Capítulo 1, o monólito unificado apresentou menor tempo de resposta e maior capacidade de vazão em todos os cenários avaliados. Quanto ao aproveitamento de recursos, a resposta é necessariamente qualificada: as arquiteturas convertem processamento em trabalho útil em proporção praticamente idêntica, 22,83 contra 21,94 requisições por segundo por núcleo, porém o particionamento do orçamento entre nove contêineres impede que o ecossistema de microsserviços recrute mais do que 16,8% dos recursos disponíveis, contra 39,4% do monólito.

A desagregação por operação, entretanto, impede que esses resultados sejam lidos como superioridade irrestrita do modelo centralizado. O monólito entrega mais que o dobro da capacidade agregada, mas propaga a saturação entre as operações, degradando em até 29,3 vezes uma consulta cujo trabalho e cuja demanda permaneceram praticamente constantes. Os microsserviços pagam custo elevado no caminho composto, decorrente da soma das chamadas remotas ao limite por serviço, porém contêm a falha ao domínio que a originou: a mesma consulta manteve conformidade integral com o objetivo de nível de serviço sob a carga mais severa. Em um prontuário eletrônico de emergência, essa distinção possui significado operacional direto: a saturação do fluxo de triagem não impede, na arquitetura distribuída, o acesso ao cadastro do paciente pela equipe assistencial. A escolha arquitetural, à luz destes resultados, não se reduz à identificação do modelo mais rápido, mas à definição de qual modo de falha é aceitável no contexto de aplicação.

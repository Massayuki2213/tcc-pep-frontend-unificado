# 6 AVALIAÇÃO E RESULTADOS

Este capítulo apresenta os resultados obtidos nos ensaios de benchmarking e a validação estatística inferencial dos dados coletados. A exposição inicia pela caracterização do conjunto de dados e pela verificação dos pressupostos que sustentam os testes aplicados, pois a validade dos valores de significância reportados adiante depende dessas condições. Em seguida, cada família de métricas prevista na seção 2.4.1 é analisada separadamente: tempo de resposta, vazão, taxa de erros e consumo de recursos computacionais. Por fim, a análise é desagregada por operação, procedimento que revela um comportamento não observável nos indicadores agregados e que se mostrou determinante para a resposta à questão de pesquisa.

## 6.1 Delineamento experimental e conjunto de dados

Os ensaios seguiram um delineamento fatorial completo com dois fatores. O primeiro fator, arquitetura, apresenta dois níveis: monólito unificado e ecossistema de microsserviços. O segundo fator, intensidade de carga, apresenta três níveis correspondentes aos cenários descritos na seção 3.5: Normal, com 50 usuários virtuais; Dia Corrido, com 150; e Emergencial, com 300. A combinação desses fatores produz seis células experimentais, cada uma replicada cinco vezes, totalizando trinta observações independentes.

A unidade experimental adotada é a rodada completa de teste, e não a requisição individual. Essa definição decorre de uma limitação intrínseca ao instrumento de medição: a ferramenta Grafana k6 consolida o resultado de cada execução em um sumário agregado, de modo que os percentis e as médias derivam todos do mesmo conjunto de requisições e não constituem medidas independentes entre si. A replicação, portanto, provém da repetição da mesma condição experimental, que é exatamente o que o Teste t e a Análise de Variância exigem para estimar o erro amostral.

Três procedimentos foram adotados para preservar a validade interna do experimento. Primeiro, a ordem de execução das trinta rodadas foi aleatorizada por meio de um gerador pseudoaleatório com semente fixa, declarada no registro da campanha. A execução em blocos, na qual todas as rodadas de uma arquitetura precederiam as da outra, confundiria o efeito da arquitetura com efeitos temporais, a exemplo do aquecimento progressivo do processador e da variação de processos de segundo plano; a aleatorização distribui esses efeitos entre as células, e a semente fixa preserva a reprodutibilidade. Segundo, as bases de dados relacional e não relacional foram integralmente truncadas antes de cada rodada, impedindo que o volume acumulado de registros de uma execução anterior influenciasse o desempenho da seguinte. Terceiro, rodadas interrompidas, incompletas ou com volume de amostras inferior ao mínimo estabelecido foram descartadas automaticamente e repetidas, de maneira que nenhuma execução parcial ingressasse no conjunto de dados. Das trinta rodadas planejadas, trinta foram validadas e nenhuma foi descartada.

A totalidade dos ensaios reportados neste capítulo foi executada em uma única máquina hospedeira, cujas especificações constam do Capítulo 5, de modo que o perfil de hardware permanece constante em todas as observações e não atua como fonte de variação não controlada.

## 6.2 Verificação dos pressupostos

O Teste t e a Análise de Variância assumem independência entre as observações, homogeneidade aproximada das variâncias e normalidade dos resíduos. A independência decorre do próprio protocolo, já que cada rodada é executada sobre bases zeradas e em ordem sorteada. As duas demais condições foram verificadas empiricamente.

A dispersão interna das células foi avaliada pelo coeficiente de variação. Para o tempo de resposta médio em escala bruta, os coeficientes situaram-se entre 10,1% e 32,2%, com o valor máximo observado na célula monólito sob carga Normal. Essa heterogeneidade é esperada em métricas de latência, cujo desvio-padrão tende a crescer proporcionalmente à média, violando o pressuposto de homocedasticidade. Adotou-se, por essa razão, a transformação logarítmica natural da variável-resposta para as análises inferenciais de tempo de resposta, procedimento consolidado na literatura de engenharia de desempenho por estabilizar a variância e aproximar a distribuição dos resíduos da normal. Após a transformação, os coeficientes de variação reduziram-se à faixa de 1,1% a 5,0%, indicando medição controlada.

A normalidade dos resíduos foi diagnosticada por meio dos coeficientes de assimetria e curtose e pela inspeção do gráfico quantil-quantil. Para o tempo de resposta em escala logarítmica, obteve-se assimetria de 0,08 e curtose de −0,26, com escores padronizados de 0,18 e −0,31 respectivamente, ambos amplamente contidos no intervalo compatível com a distribuição normal. A vazão apresentou assimetria de 0,12 e curtose de −0,95, e o consumo de memória, assimetria de −0,53 e curtose de 1,05, igualmente aceitáveis. Optou-se por não aplicar o teste de Shapiro-Wilk, uma vez que, com trinta observações, seu poder estatístico é reduzido e detectaria apenas desvios grosseiros, ao passo que os coeficientes de forma associados ao gráfico quantil-quantil permitem identificar a natureza do desvio — cauda pesada ou assimetria — de maneira inspecionável.

O delineamento manteve-se balanceado, com cinco observações em cada uma das seis células, condição assumida pela decomposição da soma de quadrados empregada na Análise de Variância de dois fatores. Todos os testes adotam nível de significância de 5%.

## 6.3 Tempo de resposta

A Tabela 1 apresenta as estatísticas descritivas do tempo médio de resposta e dos percentis de cauda, em escala bruta, para as seis células experimentais.

**Tabela 1 – Tempo de resposta por arquitetura e cenário de carga (n = 5)**

| Arquitetura | Cenário | Latência média (ms) | Desvio-padrão | p95 (ms) | p99 (ms) |
|---|---|---|---|---|---|
| Monólito | Normal | 458,43 | 147,56 | 2.147,46 | 3.366,31 |
| Monólito | Dia Corrido | 2.919,25 | 489,65 | 11.852,52 | 15.603,90 |
| Monólito | Emergencial | 5.927,94 | 1.187,92 | 24.451,74 | 32.003,84 |
| Microsserviços | Normal | 2.105,45 | 514,23 | 6.996,89 | 8.856,21 |
| Microsserviços | Dia Corrido | 7.301,23 | 1.382,89 | 23.102,55 | 26.973,92 |
| Microsserviços | Emergencial | 14.012,49 | 1.409,75 | 55.113,49 | 56.634,14 |

Fonte: elaborada pelos autores, 2026.

O monólito registrou tempos de resposta inferiores aos do ecossistema de microsserviços em todos os cenários avaliados. A diferença relativa é mais acentuada sob carga Normal, na qual a latência dos microsserviços supera a do monólito em 359,3%, e reduz-se progressivamente para 150,1% sob Dia Corrido e 136,4% sob carga Emergencial. Em termos absolutos, contudo, o comportamento é inverso: a distância entre as arquiteturas amplia-se de 1.647 ms para 8.085 ms ao longo dos três cenários. Essa combinação indica que ambas as arquiteturas aproximam-se de seus respectivos limites de saturação, porém em patamares distintos.

O Teste t de Welch para amostras independentes, aplicado sobre a variável-resposta transformada, confirma a significância estatística da diferença em todos os cenários. Sob carga Normal obteve-se t = −8,67 com 7,75 graus de liberdade e p < 0,0001; sob Dia Corrido, t = −7,94 com 7,93 graus de liberdade e p < 0,0001; e sob carga Emergencial, t = −8,77 com 6,11 graus de liberdade e p = 0,0001. Adotou-se a correção de Welch em lugar do Teste t de Student clássico porque as variâncias dos dois grupos diferem entre si, condição na qual a versão clássica subestima o erro-padrão. Os tamanhos de efeito, medidos pelo d de Cohen, situaram-se entre −5,02 e −5,54, magnitudes que excedem em larga medida o limiar convencional de 0,8 para efeito grande.

A Análise de Variância de dois fatores, apresentada na Tabela 2, decompõe a variação total observada.

**Tabela 2 – ANOVA de dois fatores para o tempo de resposta, em escala logarítmica**

| Fonte de variação | F | p | η²p |
|---|---|---|---|
| Arquitetura | 202,14 | < 0,0001 | 0,894 |
| Carga | 292,04 | < 0,0001 | 0,924 |
| Arquitetura × Carga | 7,63 | 0,0027 | 0,389 |
| Resíduo (gl = 24) | — | — | — |

Fonte: elaborada pelos autores, 2026.

Os dois fatores principais mostraram-se significativos, com tamanhos de efeito parciais elevados: a arquitetura explica 89,4% da variação residual do tempo de resposta e a intensidade de carga, 92,4%. O termo de interação também é significativo (p = 0,0027), com η²p de 0,389, indicando que a magnitude da diferença entre as arquiteturas não é constante ao longo dos níveis de carga — resultado coerente com a redução da diferença relativa descrita anteriormente.

O teste post-hoc de Tukey HSD, aplicado às quinze comparações par a par entre as seis células, confirmou a significância das três comparações que confrontam as arquiteturas sob o mesmo nível de carga, todas com p < 0,0001. O procedimento de Tukey foi adotado em substituição a testes t independentes porque quinze comparações simultâneas ao nível de 5% produziriam, apenas por efeito do acaso, aproximadamente um falso positivo.

Duas comparações, entretanto, não atingiram significância estatística, e são precisamente as mais informativas quanto à magnitude do efeito observado. O monólito sob carga Emergencial não difere significativamente dos microsserviços sob carga Dia Corrido (p = 0,6353), tampouco o monólito sob Dia Corrido difere dos microsserviços sob carga Normal (p = 0,1578). Em termos operacionais, o monólito submetido a 300 usuários virtuais apresenta tempo de resposta estatisticamente indistinguível daquele apresentado pelos microsserviços sob 150, e o monólito sob 150 equipara-se aos microsserviços sob 50. A diferença entre as arquiteturas, portanto, equivale a aproximadamente um nível inteiro de carga do delineamento.

## 6.4 Vazão

A vazão, medida em requisições concluídas por segundo, apresentou médias de 29,15, 32,00 e 32,30 req/s para o monólito nos cenários Normal, Dia Corrido e Emergencial, respectivamente, contra 13,87, 14,49 e 13,62 req/s para os microsserviços. A Análise de Variância indicou efeito significativo da arquitetura (F = 195,92; p < 0,0001; η²p = 0,891), mas não da intensidade de carga (F = 0,77; p = 0,4763) nem da interação (F = 0,66; p = 0,5262).

A ausência de efeito do fator carga sobre a vazão constitui o resultado central desta seção e exige interpretação cuidadosa. O ensaio adota modelo de laço fechado: cada usuário virtual emite uma requisição, aguarda a resposta completa, observa um intervalo de reflexão de um segundo e só então emite a requisição seguinte. Nessa configuração, a vazão não é uma variável imposta pelo pesquisador, e sim uma resposta do sistema sob teste. O aumento de 50 para 300 usuários virtuais, correspondente a seis vezes a concorrência inicial, elevou a vazão do monólito em apenas 10,8% e não produziu elevação nos microsserviços. Ambas as arquiteturas, portanto, já operavam próximas ao seu limite de saturação no cenário de menor carga, e a demanda excedente converteu-se em enfileiramento — exatamente o que explica a elevação acentuada da latência documentada na seção anterior.

Decorre dessa constatação uma ressalva metodológica que este trabalho entende necessário explicitar. Sob saturação em laço fechado, a vazão aproxima-se do quociente entre a concorrência efetiva e o tempo de ciclo, de modo que latência e vazão deixam de constituir evidências independentes. Sob carga Emergencial, a razão de latência entre as arquiteturas é de 2,36 e a razão de vazão, de 2,37 — praticamente o mesmo valor. As duas métricas são genuinamente independentes apenas fora da saturação, condição na qual as razões de fato divergem (4,59 contra 2,10 sob carga Normal). Reportar ambas como vitórias independentes do monólito sob carga Emergencial significaria contabilizar duas vezes o mesmo fenômeno.

## 6.5 Taxa de erros

A taxa de erros manteve-se em 0,00% em cinco das seis células experimentais. Registrou-se ocorrência de falhas exclusivamente na célula microsserviços sob carga Emergencial, com média de 3,97% e desvio-padrão de 3,27%, correspondente a um coeficiente de variação de 82,3%.

Esta métrica é reportada em caráter estritamente descritivo. A aplicação de inferência sobre um conjunto em que cinco das seis células apresentam variância nula não é defensável: os valores de F produzidos pela Análise de Variância são idênticos para os três termos do modelo, artefato matemático decorrente da existência de uma única célula não degenerada, e o diagnóstico de normalidade dos resíduos acusa curtose de 6,35, com escore padronizado de 7,63, muito além do intervalo compatível com a distribuição normal. O Teste t de Welch restrito ao cenário Emergencial resulta em p = 0,0532, valor que não atinge o nível de significância adotado. Conclui-se que, embora as falhas tenham ocorrido exclusivamente na arquitetura de microsserviços sob a carga mais severa, o número de replicações disponível não sustenta afirmação inferencial a respeito, e a diferença deve ser tratada como indício que demanda replicação adicional.

## 6.6 Consumo e aproveitamento de recursos computacionais

Ambas as arquiteturas operaram sob orçamento idêntico de recursos, declarado nos arquivos de orquestração de contêineres e totalizando 4,0 núcleos de processamento e 3.072 MB de memória por pilha. Essa isonomia é condição necessária para que a comparação de consumo tenha sentido.

Sob carga Emergencial, o monólito consumiu em média 1,56 núcleos, equivalentes a 39,0% do orçamento disponível, ao passo que os microsserviços consumiram 0,68 núcleos, ou 17,0%. A diferença é significativa (F = 1.271,17; p < 0,0001; η²p = 0,981), com o maior tamanho de efeito observado em todo o experimento.

Uma leitura superficial desses valores sugeriria maior eficiência dos microsserviços. O cálculo da vazão por núcleo consumido, apresentado na Tabela 3, demonstra que essa interpretação é incorreta.

**Tabela 3 – Aproveitamento do orçamento de recursos sob carga Emergencial**

| Arquitetura | Vazão (req/s) | CPU consumida (núcleos) | Vazão por núcleo | Percentual do orçamento |
|---|---|---|---|---|
| Monólito | 32,30 | 1,56 | 20,72 | 39,0% |
| Microsserviços | 13,62 | 0,68 | 20,08 | 17,0% |

Fonte: elaborada pelos autores, 2026.

As duas arquiteturas convertem processamento em trabalho útil praticamente na mesma proporção: 20,72 contra 20,08 requisições por segundo por núcleo. Os microsserviços não são menos eficientes com o processamento que utilizam; eles não conseguem utilizá-lo. A distinção entre eficiência e capacidade de recrutamento é essencial para a correta interpretação do resultado.

O detalhamento por contêiner, apresentado na Tabela 4, localiza a origem dessa limitação.

**Tabela 4 – Consumo de CPU por contêiner sob carga Emergencial, em relação ao limite declarado**

| Pilha | Contêiner | CPU média (núcleos) | Limite | % do limite (média) | % do limite (pico) |
|---|---|---|---|---|---|
| Monólito | app_nestjs_monolito | 1,139 | 2,0 | 57% | 90% |
| Monólito | db_mongo_monolito | 0,349 | 1,0 | 35% | 59% |
| Monólito | db_postgres_monolito | 0,071 | 1,0 | 7% | 52% |
| Microsserviços | ms_atendimentos | 0,294 | 0,3 | 98% | 113% |
| Microsserviços | ms_consultas_laudos | 0,160 | 0,3 | 53% | 103% |
| Microsserviços | api_gateway | 0,053 | 0,2 | 26% | 86% |
| Microsserviços | ms_auditoria | 0,048 | 0,3 | 16% | 82% |
| Microsserviços | ms_historico_clinicos | 0,030 | 0,3 | 10% | 57% |
| Microsserviços | ms_medicos | 0,029 | 0,3 | 10% | 37% |
| Microsserviços | ms_pacientes | 0,021 | 0,3 | 7% | 50% |
| Microsserviços | db_postgres_pep_ms | 0,031 | 1,0 | 3% | 13% |
| Microsserviços | db_mongo_ms | 0,013 | 1,0 | 1% | 4% |

Fonte: elaborada pelos autores, 2026.

O serviço ms_atendimentos opera a 98% de seu limite em média e atinge 113% nos instantes de pico, condição em que o mecanismo de controle de recursos do sistema operacional passa a estrangular sua execução. Simultaneamente, o serviço de pacientes utiliza 7% de seu limite e a instância não relacional, apenas 1% do seu. O orçamento de quatro núcleos encontra-se, portanto, fragmentado: o caminho crítico da requisição satura contra um teto de 0,3 núcleo enquanto recursos ociosos permanecem alocados a serviços vizinhos, sem possibilidade de transferência. O monólito, concentrando o mesmo trabalho em um único processo com teto de 2,0 núcleos, converte essa folga em desempenho, atingindo 90% de seu limite nos instantes de pico.

Quanto à memória, o monólito apresentou consumo médio crescente com a carga — 480,46 MB, 558,32 MB e 642,32 MB — enquanto os microsserviços mantiveram-se estáveis em torno de 640 MB nos três cenários. Sob carga Emergencial as duas arquiteturas tornam-se equivalentes nesta métrica (642,32 MB contra 644,26 MB; p = 0,9024), única comparação de todo o experimento em que a diferença entre as arquiteturas não é estatisticamente significativa. O consumo de pico, contudo, diverge: 895,44 MB no monólito contra 664,36 MB nos microsserviços. Nenhuma das arquiteturas aproximou-se do limite de 3.072 MB, de modo que a memória não constituiu fator restritivo nos ensaios realizados.

## 6.7 Análise por operação e isolamento de domínios de falha

Todas as análises apresentadas até esta seção utilizam a linha consolidada do relatório de carga, que corresponde à média das cinco operações executadas pelo cenário. A desagregação por operação, apresentada na Tabela 5, revela que essas operações comportam-se de maneiras opostas, informação integralmente suprimida pelo indicador agregado.

**Tabela 5 – Tempo médio de resposta por operação sob carga Emergencial**

| Operação | Monólito (ms) | Microsserviços (ms) | p | d de Cohen | Melhor desempenho |
|---|---|---|---|---|---|
| GET /pacientes/:id | 623 | 19 | 0,0182 | 2,44 | Microsserviços |
| POST /medicos | 293 | 26 | 0,0117 | 2,78 | Microsserviços |
| GET /atendimentos/:id | 5.010 | 20.841 | < 0,0001 | −12,38 | Monólito |
| GET /atendimentos/medico/:id | 10.365 | 28.856 | < 0,0001 | −6,26 | Monólito |
| POST /atendimentos | 13.839 | 23.812 | 0,0004 | −3,65 | Monólito |

Fonte: elaborada pelos autores, 2026.

Os microsserviços apresentam desempenho superior, com significância estatística, em duas das cinco operações avaliadas. A separação entre os dois conjuntos é nítida quanto à sua natureza: as três operações em que o monólito prevalece são precisamente aquelas roteadas ao serviço de atendimentos, saturado conforme demonstrado na seção anterior; as duas em que os microsserviços prevalecem são atendidas por serviços distintos.

O fator de degradação, obtido pela razão entre o tempo de resposta sob carga Emergencial e sob carga Normal dentro de uma mesma arquitetura, esclarece o mecanismo subjacente. Esse indicador compara cada arquitetura consigo mesma e, por essa razão, não é afetado pela comparação entre elas.

**Tabela 6 – Fator de degradação por operação, do cenário Normal ao Emergencial**

| Operação | Monólito | Microsserviços |
|---|---|---|
| GET /pacientes/:id | 15,2× | 0,9× |
| POST /medicos | 3,5× | 1,1× |
| GET /atendimentos/:id | 8,7× | 6,8× |
| GET /atendimentos/medico/:id | 11,9× | 8,0× |
| POST /atendimentos | 18,2× | 5,7× |

Fonte: elaborada pelos autores, 2026.

No monólito, a operação de consulta a pacientes tornou-se 15,2 vezes mais lenta entre os cenários Normal e Emergencial, ainda que o trabalho computacional executado por ela não tenha se alterado. A taxa de chegada de requisições nessa operação específica elevou-se de 5,7 para 6,6 req/s, acréscimo de aproximadamente 15%, insuficiente para explicar uma elevação de 1.420% no tempo de resposta. A degradação decorre integralmente da saturação das operações vizinhas: no monólito, as cinco operações compartilham o mesmo processo, o mesmo conjunto de threads e o mesmo grupo de conexões com os bancos de dados, de maneira que o esgotamento desses recursos por uma operação propaga-se às demais. Na arquitetura de microsserviços, a mesma operação manteve-se em 0,9×, isto é, não sofreu degradação alguma, por residir em processo e sob limite de recursos próprios. O indicador de conformidade com o objetivo de nível de serviço corrobora o achado: sob carga Emergencial, o monólito atende ao limite estabelecido em 57,2% das consultas a pacientes, contra 99,9% nos microsserviços.

Este resultado responde ainda a uma objeção previsível quanto ao delineamento, segundo a qual o limite de 0,3 núcleo por serviço configuraria desvantagem artificialmente imposta aos microsserviços. Os seis serviços operam sob o mesmo limite, e esse mesmo limite produz tempos de resposta da ordem de dezenas de milissegundos em algumas operações e de dezenas de segundos em outras. O fator determinante não é o valor do limite, mas a concentração de trabalho no serviço responsável pela composição da requisição, que executa três chamadas de rede encadeadas enquanto os demais realizam consulta direta à sua base.

Registra-se, por fim, uma limitação desta análise. Os microsserviços entregam menor vazão agregada e, consequentemente, submeteram cada operação a uma taxa de chegada inferior — 3,1 contra 6,6 req/s na consulta a pacientes sob carga Emergencial. Parte da vantagem observada decorre desse menor volume. A magnitude, contudo, não é explicável por essa diferença: uma razão de 2,1 vezes no volume de requisições não produz uma razão de 33 vezes no tempo de resposta. Ademais, o argumento relativo à degradação interna ao monólito, apresentado no parágrafo anterior, não depende da comparação entre as arquiteturas e permanece válido independentemente desse fator.

## 6.8 Síntese dos resultados

A hipótese nula de ausência de diferença de desempenho entre as arquiteturas sob idênticas condições de estresse é rejeitada para o tempo de resposta, a vazão e o consumo de recursos, com valores de significância inferiores a 0,0001 e tamanhos de efeito parciais entre 0,89 e 0,98. Não é rejeitada para o consumo médio de memória sob carga Emergencial nem para a taxa de erros, esta última por insuficiência de replicações em células não degeneradas.

Quanto à questão de pesquisa formulada no Capítulo 1, o monólito unificado apresentou menor tempo de resposta e maior capacidade de vazão em todos os cenários avaliados, com diferença equivalente a aproximadamente um nível inteiro de carga do delineamento. Quanto ao aproveitamento de recursos, a resposta é necessariamente qualificada: as arquiteturas convertem processamento em trabalho útil em proporção praticamente idêntica, porém o particionamento do orçamento entre nove contêineres impede que o ecossistema de microsserviços recrute mais do que 17% dos recursos disponíveis, contra 39% do monólito.

A desagregação por operação, entretanto, impede que esses resultados sejam lidos como superioridade irrestrita do modelo centralizado. O monólito entrega mais que o dobro da capacidade agregada, mas propaga a saturação entre as operações, degradando em 15,2 vezes uma consulta cujo trabalho e cuja demanda permaneceram praticamente constantes. Os microsserviços pagam custo elevado no caminho composto, decorrente da soma das chamadas remotas ao limite por serviço, porém contêm a falha ao domínio que a originou. Em um prontuário eletrônico de emergência, essa distinção possui significado operacional direto: a saturação do fluxo de triagem não impede, na arquitetura distribuída, o acesso ao cadastro do paciente pela equipe assistencial. A escolha arquitetural, à luz destes resultados, não se reduz à identificação do modelo mais rápido, mas à definição de qual modo de falha é aceitável no contexto de aplicação.

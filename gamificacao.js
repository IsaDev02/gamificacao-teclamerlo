// O objeto 'db' do Firebase Firestore é acessível globalmente via 'window.db'
// após ser inicializado no professor.html.

// =================================================================
// DADOS FIXOS (MISSÕES)
// =================================================================

/**
 * Retorna a lista de missões disponíveis para pontuação.
 */
function obterMissoes() {
    return [
        { nome: "Conclusão de Venda Grande", xp: 500, badge: "Venda Master" },
        { nome: "Atendimento Excelente (Pesquisa)", xp: 150, badge: "Guerreiro do Atendimento" },
        { nome: "Mentoria de Novo Colega", xp: 300, badge: "Mentor Sênior" },
        // Adicione mais missões aqui, se necessário
    ];
}

// =================================================================
// FUNÇÕES AUXILIARES (HELPERS)
// =================================================================

/**
 * Recalcula o XP total de uma turma, buscando apenas os alunos daquela turma
 * no Firestore.
 * @param {string} turmaId O ID da turma a ser recalculada.
 */
async function recalcularXPTurma(turmaId) { 
    if (!turmaId) return { success: true };

    try {
        const alunosSnapshot = await window.db.collection("alunos")
                                             .where("turmaId", "==", turmaId)
                                             .get();
        let novoXPTotal = 0;
        
        alunosSnapshot.forEach(doc => {
            novoXPTotal += doc.data().xpTotal || 0;
        });

        const turmaRef = window.db.collection("turmas").doc(turmaId);
        await turmaRef.update({
            xpAtual: novoXPTotal
        });
        console.log(`XP da turma ${turmaId} recalculado para ${novoXPTotal}.`);
        
        return { success: true };
    } catch (error) {
        console.error(`Erro ao recalcular XP da turma ${turmaId}:`, error);
        return { success: false, message: error.message };
    }
}

// =================================================================
// FUNÇÕES DE LEITURA E RANKING (GETTERS)
// =================================================================

/**
 * Obtém todas as turmas cadastradas.
 * @returns {Promise<Array<Object>>} Lista de turmas com ID e dados.
 */
async function obterTurmas() {
    try {
        const snapshot = await window.db.collection("turmas").orderBy("nome").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter turmas:", error);
        return [];
    }
}

/**
 * Obtém alunos filtrados por turma.
 * @param {string} turmaId ID da turma.
 * @returns {Promise<Array<Object>>} Lista de alunos da turma.
 */
async function obterAlunosPorTurma(turmaId) {
    if (!turmaId) return [];
    try {
        // Esta função já exige o índice turmaId + nome
        const snapshot = await window.db.collection("alunos")
            .where("turmaId", "==", turmaId)
            .orderBy("nome") 
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter alunos por turma:", error);
        return [];
    }
}

// --- FUNÇÕES NOVAS DE RANKING GERAL ---

/**
 * Obtém todos os alunos ordenados por XP total (ranking geral).
 */
async function obterRankingAlunosGeral() {
    try {
        // Exige índice xpTotal + nome
        const snapshot = await window.db.collection("alunos")
            .orderBy("xpTotal", "desc") 
            .orderBy("nome") 
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter ranking geral de alunos:", error);
        return []; 
    }
}

/**
 * Obtém todas as turmas ordenadas por XP atual (ranking geral).
 */
async function obterRankingTurmasGeral() {
    try {
        // Exige índice xpAtual + nome
        const snapshot = await window.db.collection("turmas")
            .orderBy("xpAtual", "desc") 
            .orderBy("nome") 
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter ranking geral de turmas:", error);
        return [];
    }
}

// --- FUNÇÃO PARA O RANKING POR TURMA (Corrigindo o ReferenceError) ---

/**
 * Obtém os alunos de uma turma específica, ordenados por XP total (ranking da turma).
 */
async function obterRankingAlunosPorTurma(turmaId) {
    if (!turmaId) return [];
    try {
        // Exige índice turmaId + xpTotal + nome
        const snapshot = await window.db.collection("alunos")
            .where("turmaId", "==", turmaId)
            .orderBy("xpTotal", "desc")
            .orderBy("nome") 
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter ranking individual por turma:", error);
        return [];
    }
}


// =================================================================
// FUNÇÕES DE CADASTRO (CREATE)
// =================================================================

async function cadastrarTurma(nome, metaMensal) {
    if (!nome || !metaMensal) {
        return { success: false, message: "Nome e Meta são obrigatórios." };
    }

    try {
        await window.db.collection("turmas").add({
            nome: nome,
            metaMensal: parseInt(metaMensal),
            xpAtual: 0, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: "Turma cadastrada com sucesso." };
    } catch (error) {
        console.error("Erro ao cadastrar turma:", error);
        return { success: false, message: `Falha ao cadastrar turma: ${error.message}` };
    }
}

async function cadastrarAluno(nome, turmaId) {
    if (!nome || !turmaId) {
        return { success: false, message: "Nome e Turma são obrigatórios." };
    }

    try {
        await window.db.collection("alunos").add({
            nome: nome,
            turmaId: turmaId,
            xpTotal: 0, 
            badges: [], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await recalcularXPTurma(turmaId);

        return { success: true, message: "Aluno cadastrado com sucesso." };
    } catch (error) {
        console.error("Erro ao cadastrar aluno:", error);
        return { success: false, message: `Falha ao cadastrar aluno: ${error.message}` };
    }
}


// =================================================================
// FUNÇÃO DE PONTUAÇÃO (UPDATE)
// =================================================================

async function atualizarPontuacao(alunoDocId, xp, badgeNome = null) {
    if (!alunoDocId || typeof xp !== 'number' || xp <= 0) {
        return { success: false, message: "Dados de pontuação inválidos." };
    }

    const alunoRef = window.db.collection("alunos").doc(alunoDocId);

    try {
        const alunoDoc = await alunoRef.get();
        if (!alunoDoc.exists) {
            throw new Error("Aluno não encontrado.");
        }
        
        const alunoData = alunoDoc.data();
        const novoXPTotal = (alunoData.xpTotal || 0) + xp; 
        const turmaId = alunoData.turmaId;

        let updateData = {
            xpTotal: novoXPTotal
        };

        if (badgeNome) {
            updateData.badges = firebase.firestore.FieldValue.arrayUnion(badgeNome);
        }
        
        await alunoRef.update(updateData);
        
        await recalcularXPTurma(turmaId);

        return { success: true, message: "Pontuação lançada com sucesso." };

    } catch (error) {
        console.error("Erro ao atualizar pontuação:", error);
        return { success: false, message: `Falha ao lançar pontuação: ${error.message}` };
    }
}

// =================================================================
// CRUD DE DADOS (TURMA e ALUNO) - (Mantidos)
// =================================================================

async function excluirTurma(turmaId) {
    if (!turmaId) return { success: false, message: "ID da turma inválido." };
    // ... (lógica de exclusão em Batch) ...
    try {
        const alunosSnapshot = await window.db.collection("alunos").where("turmaId", "==", turmaId).get();
        const batch = window.db.batch();

        if (!alunosSnapshot.empty) {
            alunosSnapshot.docs.forEach(alunoDoc => {
                batch.delete(alunoDoc.ref);
            });
        }
        const turmaRef = window.db.collection("turmas").doc(turmaId);
        batch.delete(turmaRef);
        await batch.commit();
        return { success: true, message: "Turma e alunos associados excluídos com sucesso." };
    } catch (error) {
        console.error("Erro ao excluir turma:", error);
        return { success: false, message: `Falha ao excluir turma: ${error.message}` };
    }
}

async function editarTurma(turmaId, novoNome, novaMetaMensal) {
    // ... (lógica de edição de turma) ...
    if (!turmaId || !novoNome || novaMetaMensal === undefined) return { success: false, message: "Dados de edição incompletos." };
    try {
        const turmaRef = window.db.collection("turmas").doc(turmaId);
        await turmaRef.update({
            nome: novoNome,
            metaMensal: parseInt(novaMetaMensal) 
        });
        return { success: true, message: `Turma ${novoNome} editada com sucesso.` };
    } catch (error) {
        console.error("Erro ao editar turma:", error);
        return { success: false, message: `Falha ao editar turma: ${error.message}` };
    }
}

async function excluirAluno(alunoId) {
    // ... (lógica de exclusão de aluno e recalculo de XP) ...
    if (!alunoId) return { success: false, message: "ID do aluno inválido." };
    try {
        const alunoRef = window.db.collection("alunos").doc(alunoId);
        const alunoDoc = await alunoRef.get();
        if (!alunoDoc.exists) throw new Error("Aluno não encontrado.");
        const turmaId = alunoDoc.data().turmaId;
        await alunoRef.delete();
        await recalcularXPTurma(turmaId);
        return { success: true, message: "Aluno excluído com sucesso." };
    } catch (error) {
        console.error("Erro ao excluir aluno:", error);
        return { success: false, message: `Falha ao excluir aluno: ${error.message}` };
    }
}

async function editarAluno(alunoId, novoNome, novaTurmaId, novoXPTotal) {
    // ... (lógica de edição de aluno e recalculo de XP em ambas as turmas) ...
    if (!alunoId || !novoNome || !novaTurmaId || novoXPTotal === undefined) return { success: false, message: "Dados de edição incompletos." };
    try {
        const alunoRef = window.db.collection("alunos").doc(alunoId);
        const alunoDoc = await alunoRef.get();
        if (!alunoDoc.exists) throw new Error("Aluno não encontrado.");

        const turmaIdAntiga = alunoDoc.data().turmaId;
        
        await alunoRef.update({
            nome: novoNome,
            turmaId: novaTurmaId,
            xpTotal: parseInt(novoXPTotal), 
        });

        if (turmaIdAntiga && turmaIdAntiga !== novaTurmaId) {
            await recalcularXPTurma(turmaIdAntiga);
        }
        await recalcularXPTurma(novaTurmaId);
        return { success: true, message: `Aluno ${novoNome} editado com sucesso.` };
    } catch (error) {
        console.error("Erro ao editar aluno:", error);
        return { success: false, message: `Falha ao editar aluno: ${error.message}` };
    }
}


// =================================================================
// EXPORTAÇÃO DE FUNÇÕES (Corrigido para incluir todas as funções)
// =================================================================

window.obterTurmas = obterTurmas;
window.obterAlunosPorTurma = obterAlunosPorTurma;
window.obterMissoes = obterMissoes;
window.cadastrarTurma = cadastrarTurma;
window.cadastrarAluno = cadastrarAluno;
window.atualizarPontuacao = atualizarPontuacao;
window.excluirTurma = excluirTurma;
window.editarTurma = editarTurma; 
window.excluirAluno = excluirAluno; 
window.editarAluno = editarAluno;

// 🟢 NOVAS EXPORTAÇÕES DE RANKING
window.obterRankingAlunosGeral = obterRankingAlunosGeral;
window.obterRankingTurmasGeral = obterRankingTurmasGeral;

// 🟢 CORRIGE O ReferenceError: EXPORTA A FUNÇÃO COM O NOME ESPERADO PELO HTML
window.gerarRankingIndividualPorTurma = obterRankingAlunosPorTurma;
import React, { useState } from 'react';
import {
  GkGloveBallIcon as Send,
  GkMapPinIcon as MapPin,
  GkCheckIcon as Check,
  GkCheckIcon as CheckCheck,
  GkWhatsAppIcon as Phone,
  GkShieldIcon as Shield,
  GkStarRatingIcon as Star,
  GkChevronRightIcon as ArrowLeft,
  GkMapPinIcon as Navigation,
  GkChatIcon as MessageSquare,
  GkWhatsAppIcon as MessageCircle,
  GkRadarIcon as Radar,
  GkFlameIcon as Sparkles,
  GkHelpFaqIcon as Info
} from './icons';
import { Conversation, ChatMessage, UserProfile } from '../types';
import { ChatPanelSkeleton } from './SkeletonLoading';

interface ChatTabProps {
  user: UserProfile;
  conversations: Conversation[];
  onSendMessage: (conversationId: string, text: string, type?: 'text' | 'location') => void;
  onOpenWhatsApp: () => void;
  onOpenRadar?: () => void;
  isLoading?: boolean;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  user,
  conversations,
  onSendMessage,
  onOpenWhatsApp,
  onOpenRadar,
  isLoading = false,
}) => {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversations.length > 0 ? conversations[0].id : null
  );
  const [inputText, setInputText] = useState('');

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeConversation) return;

    onSendMessage(activeConversation.id, text.trim(), 'text');
    setInputText('');
  };

  const handleSendLocation = () => {
    if (!activeConversation) return;
    onSendMessage(
      activeConversation.id,
      `Localização confirmada: ${activeConversation.arenaName || 'Arena da Partida'}`,
      'location'
    );
  };

  if (isLoading) {
    return (
      <div className="pb-24 max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Mensagens & Alinhamento
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Canal exclusivo para suporte oficial e contato direto com goleiros convocados
            </p>
          </div>
        </div>
        <ChatPanelSkeleton />
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-5xl mx-auto">
      {/* If there are NO conversations at all, display a clean, reassuring empty state */}
      {conversations.length === 0 ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Mensagens & Alinhamento
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Canal exclusivo para suporte oficial e contato direto com goleiros convocados
              </p>
            </div>

            <button
              onClick={onOpenWhatsApp}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Plantão WhatsApp (15) 98159-6443</span>
            </button>
          </div>

          {/* Empty State Banner */}
          <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center space-y-4 shadow-xl transition-colors">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-inner">
              <MessageSquare className="w-8 h-8 text-emerald-600 dark:text-emerald-400/80" />
            </div>

            <div className="max-w-md space-y-1.5">
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                Nenhuma conversa ativa no momento
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Todas as mensagens simuladas de terceiros foram removidas. Este espaço permanece limpo e será utilizado exclusivamente para suas convocações reais de partidas e suporte oficial.
              </p>
            </div>

            {/* Practical Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg pt-2 text-left">
              {/* WhatsApp Support Direct Card */}
              <div
                onClick={onOpenWhatsApp}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer group flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                      Suporte Real 24h
                    </h4>
                    <span className="text-[10px] text-slate-500">Plantão WhatsApp</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tire dúvidas sobre pagamentos, regras de W.O. ou problemas na quadra.
                </p>
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1">
                  <span>Iniciar Atendimento</span>
                  <span>→</span>
                </div>
              </div>

              {/* Convocação Radar Card */}
              {onOpenRadar && (
                <div
                  onClick={onOpenRadar}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 transition-all cursor-pointer group flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <Radar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
                        Radar de Goleiros
                      </h4>
                      <span className="text-[10px] text-slate-500">Buscar no Raio 8km</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Ao confirmar uma convocação, o chat do jogo será criado automaticamente aqui.
                  </p>
                  <div className="text-[11px] font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1 pt-1">
                    <span>Abrir Convocação</span>
                    <span>→</span>
                  </div>
                </div>
              )}
            </div>

            {/* Trust badge */}
            <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Comunicação segura e auditada pelo ArenaDraft</span>
            </div>
          </div>
        </div>
      ) : (
        /* Real Active Conversation View */
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl dark:shadow-2xl h-[78vh] flex flex-col md:flex-row transition-colors">
          {/* Left: Conversation List */}
          <div
            className={`w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950/60 ${
              activeConversationId ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Conversas de Partidas
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {conversations.length} {conversations.length === 1 ? 'conversa ativa' : 'conversas ativas'}
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                Oficial
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800/60">
              {conversations.map((conv) => {
                const isSelected = conv.id === activeConversationId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-white dark:bg-slate-900 border-l-2 border-emerald-500' : 'hover:bg-white/70 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {conv.participantAvatar ? (
                        <img
                          src={conv.participantAvatar}
                          alt={conv.participantName}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-300 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-display font-black text-sm text-emerald-600 dark:text-[#22c55e]">
                          {(conv.participantName || 'GK')
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((n) => n[0]?.toUpperCase() || '')
                            .join('')}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {conv.participantName}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {conv.lastMessageTime}
                        </span>
                      </div>

                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate mb-1">
                        {conv.arenaName}
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                          {conv.lastMessage}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Active Chat View */}
          {activeConversation ? (
            <div
              className={`flex-1 flex flex-col bg-white dark:bg-slate-900 ${
                !activeConversationId ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveConversationId(null)}
                    className="md:hidden p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  {activeConversation.participantAvatar ? (
                    <img
                      src={activeConversation.participantAvatar}
                      alt={activeConversation.participantName}
                      className="w-10 h-10 rounded-xl object-cover border border-emerald-500/40"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border border-emerald-500/40 flex items-center justify-center font-display font-black text-xs text-emerald-600 dark:text-[#22c55e]">
                      {(activeConversation.participantName || 'GK')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase() || '')
                        .join('')}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {activeConversation.participantName}
                      </h3>
                      <div className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        <Star className="w-3 h-3 fill-emerald-500 dark:fill-emerald-400" />
                        <span>{activeConversation.participantRating}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      "{activeConversation.participantNickname}" · {activeConversation.matchDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenWhatsApp}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Abrir Suporte no WhatsApp"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">WhatsApp Suporte</span>
                  </button>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100/80 dark:bg-[#020617]/50">
                {/* Match Details Banner */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Partida: <strong>{activeConversation.arenaName}</strong></span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                    Custódia Ativa
                  </span>
                </div>

                {activeConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.isMine
                          ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-950/20 dark:shadow-emerald-950/40'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-200 dark:border-slate-700/60 shadow-sm dark:shadow-none'
                      }`}
                    >
                      {/* Location Card if message type is location */}
                      {msg.type === 'location' && msg.locationData && (
                        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 mb-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{msg.locationData.arenaName}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {msg.locationData.address}
                          </div>
                        </div>
                      )}

                      <p>{msg.text}</p>

                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                          msg.isMine ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        <span>{msg.timestamp}</span>
                        {msg.isMine && (
                          <span>
                            {msg.status === 'read' ? (
                              <CheckCheck className="w-3 h-3 text-sky-300" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Context Chips */}
              <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/70 flex items-center gap-2 overflow-x-auto">
                <span className="text-[10px] text-slate-500 font-mono shrink-0">Alinhamento:</span>
                {[
                  'Chego 15min antes pra aquecer!',
                  'Qual a cor do colete do time?',
                  'Endereço confirmado!',
                  'Tô a caminho da Arena.',
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(chip)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 text-[11px] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendLocation}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                  title="Compartilhar Localização da Arena"
                >
                  <MapPin className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend();
                  }}
                  placeholder="Digite sua mensagem de alinhamento..."
                  className="flex-1 h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
                />

                <button
                  type="button"
                  onClick={() => handleSend()}
                  className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 hidden md:flex items-center justify-center text-slate-500 text-xs">
              Selecione uma partida para visualizar a conversa.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

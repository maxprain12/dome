'use client';

import { useState } from 'react';
import { Save, Eye, EyeOff } from 'lucide-react';

export default function AISettings() {
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'local'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: Guardar en la base de datos usando la función saveAIConfig
    console.log('Guardando configuración:', {
      provider,
      apiKey,
      model,
      embeddingModel,
      baseURL,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Configuración de IA
        </h2>
        <p className="text-gray-600">
          Configura tu proveedor de inteligencia artificial para habilitar búsqueda semántica,
          transcripciones automáticas y el asistente de IA.
        </p>
      </div>

      {/* Proveedor */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Proveedor de IA
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setProvider('openai')}
            className={`p-4 border-2 rounded-lg text-center transition-all ${
              provider === 'openai'
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900">OpenAI</div>
            <div className="text-xs text-gray-500 mt-1">GPT-4, Embeddings</div>
          </button>

          <button
            onClick={() => setProvider('anthropic')}
            className={`p-4 border-2 rounded-lg text-center transition-all ${
              provider === 'anthropic'
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900">Anthropic</div>
            <div className="text-xs text-gray-500 mt-1">Claude 3.5 Sonnet</div>
          </button>

          <button
            onClick={() => setProvider('local')}
            className={`p-4 border-2 rounded-lg text-center transition-all ${
              provider === 'local'
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900">Local</div>
            <div className="text-xs text-gray-500 mt-1">Ollama, LM Studio</div>
          </button>
        </div>
      </div>

      {/* API Key */}
      {provider !== 'local' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === 'openai'
                  ? 'sk-...'
                  : 'sk-ant-...'
              }
              className="input pr-10"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {provider === 'openai' && (
              <>
                Obtén tu API key en{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  platform.openai.com
                </a>
              </>
            )}
            {provider === 'anthropic' && (
              <>
                Obtén tu API key en{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  console.anthropic.com
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {/* Base URL (Local) */}
      {provider === 'local' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            URL Base
          </label>
          <input
            type="url"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="http://localhost:11434"
            className="input"
          />
          <p className="text-xs text-gray-500 mt-1">
            URL de tu servidor local (Ollama, LM Studio, etc.)
          </p>
        </div>
      )}

      {/* Modelo de Chat */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Modelo de Chat
        </label>
        {provider === 'openai' && (
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
            <option value="">Seleccionar modelo...</option>
            <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>
        )}
        {provider === 'anthropic' && (
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
            <option value="">Seleccionar modelo...</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="claude-3-opus-20240229">Claude 3 Opus</option>
            <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
          </select>
        )}
        {provider === 'local' && (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llama2, mixtral, etc."
            className="input"
          />
        )}
      </div>

      {/* Modelo de Embeddings */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Modelo de Embeddings
        </label>
        {provider === 'openai' && (
          <select
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            className="input"
          >
            <option value="">Seleccionar modelo...</option>
            <option value="text-embedding-3-small">text-embedding-3-small (Recomendado)</option>
            <option value="text-embedding-3-large">text-embedding-3-large</option>
            <option value="text-embedding-ada-002">text-embedding-ada-002 (Legacy)</option>
          </select>
        )}
        {provider === 'local' && (
          <input
            type="text"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="nomic-embed-text, etc."
            className="input"
          />
        )}
        {provider === 'anthropic' && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Anthropic no ofrece modelos de embeddings. Usa OpenAI para embeddings
              o configura un modelo local.
            </p>
          </div>
        )}
      </div>

      {/* Botón Guardar */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Guardar Configuración
        </button>

        {saved && (
          <span className="text-sm text-green-600 font-medium">
            ✓ Configuración guardada
          </span>
        )}
      </div>

      {/* Info adicional */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">💡 Recomendaciones</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>OpenAI</strong>: Mejor para embeddings de alta calidad</li>
          <li>• <strong>Anthropic</strong>: Excelente para análisis y chat (requiere OpenAI para embeddings)</li>
          <li>• <strong>Local</strong>: Privacidad total, sin costos por uso</li>
        </ul>
      </div>
    </div>
  );
}

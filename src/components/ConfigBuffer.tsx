import { useState } from 'react';

interface ConfigBufferProps {
  provider: string;
  onSave: () => void;
}

export default function ConfigBuffer({ provider, onSave }: ConfigBufferProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(`TETREL_API_KEY_${provider}`) ?? '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem(`TETREL_API_KEY_${provider}`, apiKey);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onSave(); // Optional callback after save
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-200 uppercase">
        Configure connection for {provider}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-razzmatazz uppercase">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full bg-transparent border border-gray-600 focus:border-razzmatazz outline-none px-3 py-2 text-white !rounded-none font-mono text-sm transition-colors"
          placeholder="sk-or-v1-..."
          spellCheck="false"
        />
      </div>

      <button
        onClick={handleSave}
        className="mt-2 bg-razzmatazz text-background font-bold uppercase py-2 px-4 !rounded-none hover:bg-white hover:text-razzmatazz transition-all duration-200 border border-transparent hover:border-razzmatazz cursor-pointer"
      >
        {saved ? 'Saved!' : 'Save Configuration'}
      </button>
    </div>
  );
}

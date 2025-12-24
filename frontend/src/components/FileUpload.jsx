import { useCallback, useState } from 'react';
import { Upload, File, X } from 'lucide-react';

const FileUpload = ({ onFileSelect, accept = '.session,.zip', multiple = true }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file) => {
    const validTypes = ['.session', '.zip'];
    const fileName = file.name.toLowerCase();
    const isValid = validTypes.some(type => fileName.endsWith(type));
    return isValid;
  };

  const processFiles = useCallback((files) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(validateFile);
    
    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const newFiles = multiple 
          ? [...prev, ...validFiles]
          : validFiles;
        onFileSelect?.(multiple ? newFiles : newFiles[0]);
        return newFiles;
      });
    }
  }, [multiple, onFileSelect]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileInput = (e) => {
    processFiles(e.target.files);
    // Reset input to allow selecting same file again
    e.target.value = '';
  };

  const handleRemove = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFileSelect?.(multiple ? newFiles : (newFiles.length > 0 ? newFiles[0] : null));
  };

  const handleRemoveAll = () => {
    setSelectedFiles([]);
    onFileSelect?.(null);
  };

  return (
    <div className="w-full">
      {selectedFiles.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-300 ${
            isDragging
              ? 'border-white/30 bg-white/[0.03]'
              : 'border-white/10 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.02]'
          }`}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept={accept}
            multiple={multiple}
            onChange={handleFileInput}
          />
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <div className={`p-4 rounded-full mb-4 transition-colors ${
              isDragging ? 'bg-white/10' : 'bg-white/5'
            }`}>
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-white mb-1">
              Drop session files or ZIP archives here
            </p>
            <p className="text-xs text-gray-500">
              or <span className="text-white/60 underline">click to browse</span>
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Supports .session files and .zip archives {multiple && '(multiple selection enabled)'}
            </p>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="border border-white/10 rounded-xl p-4 bg-white/[0.02] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <File className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(index)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ))}
          {multiple && selectedFiles.length > 0 && (
            <button
              onClick={handleRemoveAll}
              className="w-full text-xs text-gray-400 hover:text-white transition-colors py-2"
            >
              Remove all
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;

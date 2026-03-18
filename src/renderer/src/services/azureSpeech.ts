/**
 * Azure Speech Recognition Service for Frontend
 * 
 * Provides speech-to-text capabilities using Microsoft Azure Cognitive Services.
 * Integrates continuous speech recognition with microphone input.
 */

export interface SpeechRecognitionConfig {
  azureKey: string;
  azureRegion: string;
  language: string;
  recognitionLanguages?: string[];
  preferredProcessingLanguage?: string;
}

export interface SpeechRecognitionCallbacks {
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
  onRecognizing?: (data: { text: string }) => void;
  onRecognized?: (data: RecognizedResult) => void;
  onAudioQuality?: (data: AudioQualityReport) => void;
}

export interface RecognizedResult {
  text: string;
  language: string;
  resultAt: number;
  durationMs: number;
  prosody?: ProsodySummary;
  rawJson?: Record<string, unknown>;
}

export interface ProsodySummary {
  capturedAt: number;
  speechDurationMs: number;
  frameCount: number;
  voicedFrameRatio: number;
  pitchMeanHz: number;
  pitchStdDevHz: number;
  pitchConfidence: number;
  rmsMean: number;
  rmsStdDev: number;
  peakMean: number;
  zeroCrossingMean: number;
}

export interface AudioQualityReport {
  issue: string | null;
  rms: number;
  peak: number;
  noiseFloor: number;
  isSpeechDetected: boolean;
  silenceMs: number;
  speechMs: number;
  sourceType: 'microphone' | 'media' | null;
}

/**
 * Frontend Azure Speech Service
 * 
 * This service requires the Azure Speech SDK to be loaded in the page.
 * Include this in your HTML:
 * <script src="https://aka.ms/csspeech/jsbrowserpackageraw"></script>
 */
class AzureSpeechService {
  private recognizer: any = null;
  private keepAlive = false;
  private isStopping = false;
  private retryCount = 0;
  private maxRetryDelayMs = 15000;
  private callbacks: SpeechRecognitionCallbacks = {};
  private sessionStartedAt: number | null = null;
  private currentConfig: SpeechRecognitionConfig | null = null;
  private sourceType: 'microphone' | 'media' | null = null;

  /**
   * Register callbacks for speech events
   */
  on(callbacks: SpeechRecognitionCallbacks): void {
    this.callbacks = callbacks || {};
  }

  /**
   * Check if Azure Speech SDK is available
   */
  private ensureSpeechSdk(): void {
    if (!(window as any).SpeechSDK) {
      throw new Error('Azure Speech SDK is not loaded. Include: <script src="https://aka.ms/csspeech/jsbrowserpackageraw"></script>');
    }
  }

  /**
   * Request microphone permission
   */
  async requestMicrophonePermission(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      throw new Error(`Microphone access denied: ${error}`);
    }
  }

  /**
   * Start continuous speech recognition
   */
  async start(config: SpeechRecognitionConfig): Promise<void> {
    this.ensureSpeechSdk();

    if (!config.azureKey || !config.azureRegion) {
      throw new Error('Azure Speech settings are incomplete.');
    }

    this.currentConfig = { ...config };
    this.keepAlive = true;
    this.isStopping = false;
    this.retryCount = 0;
    this.sourceType = 'microphone';

    await this.requestMicrophonePermission();
    await this.startRecognizer();
  }

  /**
   * Stop speech recognition
   */
  async stop(): Promise<void> {
    this.keepAlive = false;
    this.isStopping = true;

    if (!this.recognizer) {
      this.sourceType = null;
      return;
    }

    const recognizer = this.recognizer;
    this.recognizer = null;

    return new Promise((resolve) => {
      recognizer.stopContinuousRecognitionAsync(
        () => {
          try {
            recognizer.close();
          } catch (error) {
            console.warn('Recognizer close failed', error);
          }
          resolve(undefined);
        },
        () => {
          try {
            recognizer.close();
          } catch (error) {
            console.warn('Recognizer close failed', error);
          }
          resolve(undefined);
        }
      );
    });
  }

  /**
   * Get service status
   */
  getStatus(): {
    isListening: boolean;
    sourceType: string | null;
    lastErrorMessage: string | null;
  } {
    return {
      isListening: !!this.recognizer,
      sourceType: this.sourceType,
      lastErrorMessage: null,
    };
  }

  /**
   * Private: Start recognizer
   */
  private async startRecognizer(): Promise<void> {
    const SpeechSDK = (window as any).SpeechSDK;
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      this.currentConfig!.azureKey,
      this.currentConfig!.azureRegion
    );

    speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
    speechConfig.enableDictation();
    speechConfig.setProperty(
      SpeechSDK.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
      'true'
    );
    speechConfig.setProperty(
      SpeechSDK.PropertyId.SpeechServiceResponse_PostProcessingOption,
      'TrueText'
    );

    if (this.currentConfig?.preferredProcessingLanguage) {
      speechConfig.speechRecognitionLanguage = this.currentConfig.preferredProcessingLanguage;
    } else if (this.currentConfig?.language) {
      speechConfig.speechRecognitionLanguage = this.currentConfig.language;
    }

    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

    this.wireRecognizer(recognizer);
    this.recognizer = recognizer;
    this.sessionStartedAt = Date.now();

    return new Promise((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          this.callbacks.onStatus?.('Listening');
          resolve(undefined);
        },
        (error: any) => {
          reject(new Error(error));
        }
      );
    });
  }

  /**
   * Private: Wire up event handlers
   */
  private wireRecognizer(recognizer: any): void {
    const SpeechSDK = (window as any).SpeechSDK;

    recognizer.recognizing = (_: any, event: any) => {
      this.callbacks.onRecognizing?.({ text: event.result.text || '' });
    };

    recognizer.recognized = (_: any, event: any) => {
      if (!event.result || event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
        return;
      }

      const offsetMs = Number(event.result.offset || 0) / 10000;
      const durationMs = Number(event.result.duration || 0) / 10000;
      const resultAt = (this.sessionStartedAt || Date.now()) + offsetMs;

      let detailedResult: Record<string, unknown> | undefined;
      try {
        if (event.result.json) {
          detailedResult = JSON.parse(event.result.json) as Record<string, unknown>;
        }
      } catch (error) {
        console.warn('Unable to parse Azure detailed result', error);
      }

      this.callbacks.onRecognized?.({
        text: event.result.text || '',
        language: this.currentConfig?.language || 'zh-TW',
        resultAt,
        durationMs,
        prosody: undefined,
        rawJson: detailedResult,
      });
    };

    recognizer.canceled = (_: any, event: any) => {
      this.callbacks.onStatus?.(`Canceled: ${event.errorDetails || event.reason}`);
      this.callbacks.onError?.(new Error(event.errorDetails || 'Speech recognition canceled.'));

      try {
        recognizer.close();
      } catch (error) {
        console.warn('Recognizer close failed', error);
      }
      this.recognizer = null;

      if (this.keepAlive && !this.isStopping) {
        this.scheduleRestart();
      }
    };

    recognizer.sessionStopped = () => {
      this.callbacks.onStatus?.('Session stopped.');
      try {
        recognizer.close();
      } catch (error) {
        console.warn('Recognizer close failed', error);
      }
      this.recognizer = null;

      if (this.keepAlive && !this.isStopping) {
        this.scheduleRestart();
      }
    };
  }

  /**
   * Private: Schedule reconnection with exponential backoff
   */
  private scheduleRestart(): void {
    const delay = Math.min(1500 * Math.pow(2, this.retryCount), this.maxRetryDelayMs);
    this.retryCount += 1;
    this.callbacks.onStatus?.(`Reconnecting in ${Math.round(delay / 1000)}s`);

    setTimeout(async () => {
      if (!this.keepAlive || this.isStopping) {
        return;
      }

      try {
        await this.startRecognizer();
        this.retryCount = 0;
        this.callbacks.onStatus?.('Reconnected');
      } catch (error) {
        this.callbacks.onError?.(error as Error);
        this.scheduleRestart();
      }
    }, delay);
  }
}

// Create and export singleton instance
export const azureSpeechService = new AzureSpeechService();

export default AzureSpeechService;

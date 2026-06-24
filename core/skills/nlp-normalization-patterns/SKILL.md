---
name: nlp-normalization-patterns
description: NLP text normalization for cleaner LLM context. Stemming, lemmatization, stop-word removal, entity extraction, tokenization, and sentence boundary detection — all without calling an LLM. Sources: naturalnode/natural.
origin: yana-ai — synthesized from naturalnode/natural (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /nlp-normalization-patterns

## When to Use

- Pre-process user prompt before embedding: remove stop words, stem terms
- Extract entities (dates, file paths, URLs, numbers) from agent instructions
- Normalize vocabulary before semantic similarity comparison
- Reduce token count by stripping linguistic noise from input

## Do NOT use for

- Multilingual NLP (natural has English focus; use spaCy/multilingual models for others)
- Production-grade NER (use a fine-tuned model for precision requirements)

---

## Stemming + stop word removal

```javascript
import { PorterStemmer, stopwords } from 'natural'

const STOP_WORDS = new Set(stopwords.words('english'))

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')     // strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(w => PorterStemmer.stem(w))   // "running" → "run"
}

normalizeTokens('The agent is running a complex analysis task')
// → ['agent', 'run', 'complex', 'analysi', 'task']
```

---

## Tokenization and sentence splitting

```javascript
import { SentenceTokenizer, WordTokenizer } from 'natural'

const sentTokenizer = new SentenceTokenizer()
const wordTokenizer = new WordTokenizer()

function splitSentences(text: string): string[] {
  return sentTokenizer.tokenize(text)
}

function tokenizeWords(sentence: string): string[] {
  return wordTokenizer.tokenize(sentence)  // handles contractions, punctuation
}
```

---

## Entity extraction (regex-based, fast)

```javascript
// Extract structured entities before sending to LLM
function extractEntities(text: string) {
  return {
    urls:      text.match(/https?:\/\/[^\s]+/g) ?? [],
    filePaths: text.match(/(?:\.\/|\/)?[\w\-./]+\.[a-z]{2,4}/g) ?? [],
    pids:      text.match(/\bpid[:\s]+(\d+)/gi) ?? [],
    versions:  text.match(/\bv?\d+\.\d+\.\d+\b/g) ?? [],
    emails:    text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/g) ?? [],
  }
}
```

---

## TF-IDF for relevance ranking (no LLM)

```javascript
import { TfIdf } from 'natural'

const tfidf = new TfIdf()
tfidf.addDocument('agent sandbox isolation memory')
tfidf.addDocument('http proxy intercept network egress')
tfidf.addDocument('yaml config parsing validation')

// Score a query against documents
tfidf.tfidfs('sandbox isolation', (i, measure) => {
  console.log(`doc ${i} relevance: ${measure.toFixed(4)}`)
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Stemming applied before stop word removal → stop words get stemmed but not removed
❌ Porter stemmer on non-English text → produces garbage stems
❌ WordTokenizer strips numbers → version strings like v1.3.48 become v1.3.
❌ Sentence tokenizer on code blocks → splits at periods inside function calls
❌ No Unicode normalization before tokenizing → accented chars not matched
❌ TF-IDF trained on too-small corpus → all scores collapse to same value
```

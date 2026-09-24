/**
 * AutomatiQA - Apache JMeter JMX Sanitizer & Validator
 * 
 * Ensures all generated and downloaded .jmx XML scripts strictly adhere to standard, native Apache JMeter 5.x/5.6.3
 * GUI component classes and XML specifications.
 * 
 * Fixes:
 * 1. Third-party plugin dependencies (e.g. kg.apc.*) that cause:
 *    'Cannot invoke "org.apache.jmeter.gui.JMeterGUIComponent.clearGui()" because "guicomp" is null'
 * 2. Malformed closing tags or XML pull parser syntax errors (e.g. `<responseData>false</-...`) that cause:
 *    'XmlPullParserException: expected name start and not -' / SampleSaveConfigurationConverter unmarshal ConversionException
 * 3. Incomplete, truncated, or corrupted <value class="SampleSaveConfiguration"> elements across ResultCollectors
 * 4. Unescaped XML entities (& in query strings, <, >, ", ')
 * 5. Stray text or unclosed comments outside XML tags
 */

export const CANONICAL_SAMPLE_SAVE_CONFIG = `            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>`;

export function sanitizeJmxScript(rawJmx: string): string {
  if (!rawJmx || typeof rawJmx !== 'string') return rawJmx;

  let cleaned = rawJmx.trim();

  // 1. Remove markdown code block wrappers (e.g. ```xml ... ``` or ``` ...)
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/i, '').replace(/\s*```$/i, '').trim();

  // 2. Remove comments to avoid any broken or unclosed comment markers interfering with XML parsing
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Normalize and strictly validate all SampleSaveConfiguration blocks
  // Any corrupted, partial (e.g. `<responseData>false</--`), or plugin-derived SampleSaveConfiguration
  // is replaced with 100% native JMeter 5.6.3 structure. This specifically fixes the XmlPullParserException:
  // "expected name start and not - (position: TEXT seen ...<responseData>false</-...)"
  cleaned = cleaned.replace(
    /<value\s+class=["']SampleSaveConfiguration["']>[\s\S]*?(?:<\/value>(?:\s+[a-zA-Z0-9_.-]+)?|(?=<\/objProp>))/gi,
    CANONICAL_SAMPLE_SAVE_CONFIG.trim()
  );

  // If any objProp has saveConfig without value class
  cleaned = cleaned.replace(
    /<objProp>\s*<name>saveConfig<\/name>\s*<\/objProp>/gi,
    `<objProp>\n            <name>saveConfig</name>\n${CANONICAL_SAMPLE_SAVE_CONFIG}\n          </objProp>`
  );

  // 4. Fix any malformed closing tags containing hyphens, dashes, or broken names (e.g., </-responseData>, </-->, </- ...>)
  cleaned = cleaned.replace(/<\/\s*-\s*([a-zA-Z0-9_:]+)\s*>/g, '</$1>');
  cleaned = cleaned.replace(/<\/\s*-+[^>]*>/g, '');
  cleaned = cleaned.replace(/<\/\s*-+\s*/g, '');

  // 5. Replace all 3rd-party plugin visualizers (kg.apc.*) with standard native Apache JMeter 5.x visualizers
  // This eliminates the 'guicomp is null' error in standard JMeter installations
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.HitsPerSecondGui["']/g, 'guiclass="RespTimeGraphVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.TransactionsPerSecondGui["']/g, 'guiclass="StatVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.ResponseTimesOverTimeGui["']/g, 'guiclass="RespTimeGraphVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.ThreadsStateOverTimeGui["']/g, 'guiclass="GraphVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.BytesThroughputOverTimeGui["']/g, 'guiclass="StatVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.jmeter\.vizualizers\.LatenciesOverTimeGui["']/g, 'guiclass="RespTimeGraphVisualizer"');
  cleaned = cleaned.replace(/guiclass=["']kg\.apc\.[^"']+["']/g, 'guiclass="StatVisualizer"');

  // Also replace any testname referencing jp@gc with native names
  cleaned = cleaned.replace(/testname=["']jp@gc\s*-\s*Hits per Second["']/g, 'testname="Response Time Graph"');
  cleaned = cleaned.replace(/testname=["']jp@gc\s*-\s*Transactions per Second["']/g, 'testname="Aggregate Report"');
  cleaned = cleaned.replace(/testname=["']jp@gc\s*-\s*Response Times Over Time["']/g, 'testname="Response Time Graph"');
  cleaned = cleaned.replace(/testname=["']Hits per Second["']/g, 'testname="Response Time Graph"');

  // 6. Fix common property typos from AI generation
  cleaned = cleaned.replace(/name=["']Asserion\.test_strings["']/g, 'name="Assertion.test_strings"');
  cleaned = cleaned.replace(/name=["']Asserion\.([a-zA-Z0-9_]+)["']/g, 'name="Assertion.$1"');

  // 7. Ensure standard GUI classes are properly attached to main elements if missing or empty
  cleaned = cleaned.replace(/<TestPlan(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<TestPlan', '<TestPlan guiclass="TestPlanGui" testclass="TestPlan"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<ThreadGroup(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<ThreadGroup', '<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<HTTPSamplerProxy(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<HTTPSamplerProxy', '<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<HeaderManager(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<HeaderManager', '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<ResponseAssertion(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<ResponseAssertion', '<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<DurationAssertion(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<DurationAssertion', '<DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<ConstantTimer(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<ConstantTimer', '<ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<CookieManager(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<CookieManager', '<CookieManager guiclass="CookiePanel" testclass="CookieManager"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<CacheManager(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<CacheManager', '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<ConfigTestElement(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<ConfigTestElement', '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<CSVDataSet(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<CSVDataSet', '<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<RegexExtractor(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<RegexExtractor', '<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor"');
    }
    return match;
  });

  cleaned = cleaned.replace(/<JSONPostProcessor(?![^>]*\bguiclass=)[^>]*>/g, (match) => {
    if (!match.includes('guiclass=')) {
      return match.replace('<JSONPostProcessor', '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor"');
    }
    return match;
  });

  // 8. Fix unescaped ampersands in URLs or XML attributes
  // Only replace '&' if it is not already an XML entity like &amp;, &lt;, &gt;, &quot;, &apos; or numeric entity
  cleaned = cleaned.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  // 9. Ensure XML declaration is present at the very beginning
  if (!cleaned.startsWith('<?xml')) {
    cleaned = `<?xml version="1.0" encoding="UTF-8"?>\n${cleaned}`;
  }

  return cleaned;
}

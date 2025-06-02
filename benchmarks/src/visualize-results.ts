/**
 * Visualization and analysis of benchmark results
 */

import chalk from 'chalk';
import { BenchmarkSuite, BenchmarkResult } from './benchmark-runner.js';

export interface ComparisonReport {
  summary: {
    totalTests: number;
    hyperionWins: number;
    hyperionParticipation: number;
    overallWinRate: number;
  };
  categoryAnalysis: Array<{
    category: string;
    winner: string;
    hyperionRank: number;
    performanceGap: string;
    insights: string[];
  }>;
  strengthsWeaknesses: {
    hyperionStrengths: string[];
    hyperionWeaknesses: string[];
    competitorAdvantages: Record<string, string[]>;
  };
  recommendations: string[];
}

export class ResultsAnalyzer {
  
  analyzeResults(suites: BenchmarkSuite[]): ComparisonReport {
    const report: ComparisonReport = {
      summary: this.calculateSummary(suites),
      categoryAnalysis: this.analyzeCategoryPerformance(suites),
      strengthsWeaknesses: this.identifyStrengthsWeaknesses(suites),
      recommendations: this.generateRecommendations(suites)
    };

    return report;
  }

  private calculateSummary(suites: BenchmarkSuite[]) {
    let hyperionWins = 0;
    let hyperionParticipation = 0;
    let totalTests = 0;

    for (const suite of suites) {
      totalTests++;
      const hyperionResult = suite.results.find(r => r.name.includes('Hyperion'));
      if (hyperionResult) {
        hyperionParticipation++;
        if (hyperionResult.fastest) {
          hyperionWins++;
        }
      }
    }

    return {
      totalTests,
      hyperionWins,
      hyperionParticipation,
      overallWinRate: (hyperionWins / hyperionParticipation) * 100
    };
  }

  private analyzeCategoryPerformance(suites: BenchmarkSuite[]) {
    return suites.map(suite => {
      const hyperionResult = suite.results.find(r => r.name.includes('Hyperion'));
      const sortedResults = [...suite.results].sort((a, b) => b.opsPerSecond - a.opsPerSecond);
      
      const hyperionRank = hyperionResult 
        ? sortedResults.findIndex(r => r.name === hyperionResult.name) + 1
        : 0;

      const winner = suite.results.find(r => r.fastest);
      const slowest = suite.results.find(r => r.slowest);

      let performanceGap = 'N/A';
      if (winner && slowest && hyperionResult) {
        if (hyperionResult.fastest) {
          const gap = ((hyperionResult.opsPerSecond - slowest.opsPerSecond) / slowest.opsPerSecond * 100).toFixed(1);
          performanceGap = `+${gap}% faster than slowest`;
        } else {
          const gap = ((winner.opsPerSecond - hyperionResult.opsPerSecond) / hyperionResult.opsPerSecond * 100).toFixed(1);
          performanceGap = `-${gap}% slower than winner`;
        }
      }

      const insights = this.generateCategoryInsights(suite, hyperionResult, hyperionRank);

      return {
        category: suite.name,
        winner: winner?.name || 'Unknown',
        hyperionRank,
        performanceGap,
        insights
      };
    });
  }

  private generateCategoryInsights(
    suite: BenchmarkSuite, 
    hyperionResult: BenchmarkResult | undefined, 
    rank: number
  ): string[] {
    const insights: string[] = [];

    if (!hyperionResult) {
      insights.push('Hyperion ORM not tested in this category');
      return insights;
    }

    switch (suite.name) {
      case 'Simple Queries':
        if (rank === 1) {
          insights.push('Excellent performance on basic operations');
          insights.push('Query builder optimization showing results');
        } else if (rank <= 2) {
          insights.push('Competitive performance on simple queries');
        } else {
          insights.push('Room for improvement in basic query performance');
        }
        break;

      case 'Complex Queries':
        if (rank === 1) {
          insights.push('Superior join optimization');
          insights.push('Efficient relationship handling');
        } else if (rank <= 2) {
          insights.push('Good complex query performance');
        } else {
          insights.push('Complex query optimization needed');
        }
        break;

      case 'Batch Operations':
        if (rank === 1) {
          insights.push('Unit of Work pattern proving effective');
          insights.push('Excellent batch processing capabilities');
        } else {
          insights.push('Batch operation optimization opportunity');
        }
        break;

      case 'Transaction Performance':
        if (rank === 1) {
          insights.push('Advanced transaction management paying off');
          insights.push('Savepoint implementation providing benefits');
        } else {
          insights.push('Transaction overhead analysis needed');
        }
        break;

      case 'Large Dataset Handling':
        if (rank === 1) {
          insights.push('Memory-efficient large dataset processing');
          insights.push('Connection pooling advantages evident');
        } else {
          insights.push('Large dataset streaming optimization needed');
        }
        break;
    }

    // RME analysis
    if (hyperionResult.rme < 2.0) {
      insights.push('Very consistent performance (low RME)');
    } else if (hyperionResult.rme > 3.0) {
      insights.push('Performance variability detected');
    }

    return insights;
  }

  private identifyStrengthsWeaknesses(suites: BenchmarkSuite[]) {
    const hyperionStrengths: string[] = [];
    const hyperionWeaknesses: string[] = [];
    const competitorAdvantages: Record<string, string[]> = {
      'Prisma': [],
      'Drizzle': [],
      'TypeORM': [],
      'MikroORM': []
    };

    const hyperionWins = suites.filter(s => 
      s.results.find(r => r.name.includes('Hyperion'))?.fastest
    );

    const hyperionLosses = suites.filter(s => {
      const hyperionResult = s.results.find(r => r.name.includes('Hyperion'));
      return hyperionResult && !hyperionResult.fastest;
    });

    // Identify strengths
    if (hyperionWins.length >= suites.length * 0.6) {
      hyperionStrengths.push('Consistently high performance across test categories');
    }

    if (hyperionWins.some(s => s.name.includes('Memory'))) {
      hyperionStrengths.push('Superior memory efficiency with Identity Map');
    }

    if (hyperionWins.some(s => s.name.includes('Transaction'))) {
      hyperionStrengths.push('Advanced transaction management capabilities');
    }

    if (hyperionWins.some(s => s.name.includes('Batch'))) {
      hyperionStrengths.push('Excellent batch operation performance');
    }

    // Identify weaknesses
    if (hyperionLosses.length > suites.length * 0.4) {
      hyperionWeaknesses.push('Performance gaps in some areas need attention');
    }

    // Analyze competitor advantages
    for (const suite of suites) {
      const winner = suite.results.find(r => r.fastest);
      if (winner && !winner.name.includes('Hyperion')) {
        const competitorName = winner.name;
        if (!competitorAdvantages[competitorName]) {
          competitorAdvantages[competitorName] = [];
        }
        competitorAdvantages[competitorName].push(`Superior ${suite.name.toLowerCase()} performance`);
      }
    }

    return {
      hyperionStrengths,
      hyperionWeaknesses,
      competitorAdvantages
    };
  }

  private generateRecommendations(suites: BenchmarkSuite[]): string[] {
    const recommendations: string[] = [];

    const hyperionResults = suites.map(s => 
      s.results.find(r => r.name.includes('Hyperion'))
    ).filter(Boolean);

    const averageRME = hyperionResults.reduce((sum, r) => sum + (r?.rme || 0), 0) / hyperionResults.length;
    const winRate = suites.filter(s => 
      s.results.find(r => r.name.includes('Hyperion'))?.fastest
    ).length / suites.length;

    // Performance recommendations
    if (winRate < 0.5) {
      recommendations.push('Focus on query optimization to improve overall performance');
    }

    if (averageRME > 2.5) {
      recommendations.push('Investigate performance consistency issues');
    }

    // Specific area recommendations
    const weakCategories = suites.filter(s => {
      const hyperionResult = s.results.find(r => r.name.includes('Hyperion'));
      const sortedResults = [...s.results].sort((a, b) => b.opsPerSecond - a.opsPerSecond);
      const rank = hyperionResult ? sortedResults.findIndex(r => r.name === hyperionResult.name) + 1 : 0;
      return rank > 2;
    });

    if (weakCategories.some(c => c.name.includes('Simple'))) {
      recommendations.push('Optimize basic query execution path');
    }

    if (weakCategories.some(c => c.name.includes('Complex'))) {
      recommendations.push('Improve join optimization and query planning');
    }

    if (weakCategories.some(c => c.name.includes('Batch'))) {
      recommendations.push('Enhance batch operation algorithms');
    }

    // Competitive advantages to maintain
    const strongCategories = suites.filter(s => 
      s.results.find(r => r.name.includes('Hyperion'))?.fastest
    );

    if (strongCategories.length > 0) {
      recommendations.push('Maintain competitive advantages in: ' + 
        strongCategories.map(c => c.name).join(', '));
    }

    return recommendations;
  }

  printDetailedAnalysis(report: ComparisonReport): void {
    console.log(chalk.bold.blue('\n📊 DETAILED PERFORMANCE ANALYSIS'));
    console.log(chalk.blue('═'.repeat(60)));

    // Summary
    console.log(chalk.bold.yellow('\n📈 Overall Performance Summary'));
    console.log(chalk.yellow('─'.repeat(40)));
    console.log(chalk.cyan(`Total Test Categories: ${report.summary.totalTests}`));
    console.log(chalk.cyan(`Hyperion Wins: ${report.summary.hyperionWins}/${report.summary.hyperionParticipation}`));
    console.log(chalk.cyan(`Win Rate: ${report.summary.overallWinRate.toFixed(1)}%`));

    // Category Analysis
    console.log(chalk.bold.yellow('\n🔍 Category-by-Category Analysis'));
    console.log(chalk.yellow('─'.repeat(40)));

    for (const category of report.categoryAnalysis) {
      console.log(chalk.bold.cyan(`\n${category.category}:`));
      console.log(chalk.gray(`  Winner: ${category.winner}`));
      console.log(chalk.gray(`  Hyperion Rank: #${category.hyperionRank}`));
      console.log(chalk.gray(`  Performance Gap: ${category.performanceGap}`));
      
      if (category.insights.length > 0) {
        console.log(chalk.gray('  Insights:'));
        category.insights.forEach(insight => {
          console.log(chalk.gray(`    • ${insight}`));
        });
      }
    }

    // Strengths and Weaknesses
    console.log(chalk.bold.yellow('\n💪 Strengths & Weaknesses Analysis'));
    console.log(chalk.yellow('─'.repeat(40)));

    if (report.strengthsWeaknesses.hyperionStrengths.length > 0) {
      console.log(chalk.bold.green('\nHyperion ORM Strengths:'));
      report.strengthsWeaknesses.hyperionStrengths.forEach(strength => {
        console.log(chalk.green(`  ✅ ${strength}`));
      });
    }

    if (report.strengthsWeaknesses.hyperionWeaknesses.length > 0) {
      console.log(chalk.bold.red('\nAreas for Improvement:'));
      report.strengthsWeaknesses.hyperionWeaknesses.forEach(weakness => {
        console.log(chalk.red(`  ❌ ${weakness}`));
      });
    }

    // Competitor Analysis
    console.log(chalk.bold.yellow('\n🏆 Competitor Advantages'));
    console.log(chalk.yellow('─'.repeat(40)));
    
    for (const [competitor, advantages] of Object.entries(report.strengthsWeaknesses.competitorAdvantages)) {
      if (advantages.length > 0) {
        console.log(chalk.bold.magenta(`\n${competitor}:`));
        advantages.forEach(advantage => {
          console.log(chalk.magenta(`  • ${advantage}`));
        });
      }
    }

    // Recommendations
    console.log(chalk.bold.yellow('\n🎯 Recommendations'));
    console.log(chalk.yellow('─'.repeat(40)));

    report.recommendations.forEach((rec, index) => {
      console.log(chalk.yellow(`${index + 1}. ${rec}`));
    });
  }

  generateMarkdownReport(report: ComparisonReport): string {
    let markdown = '# Hyperion ORM Performance Analysis Report\n\n';
    
    markdown += '## Executive Summary\n\n';
    markdown += `- **Total Test Categories**: ${report.summary.totalTests}\n`;
    markdown += `- **Hyperion Wins**: ${report.summary.hyperionWins}/${report.summary.hyperionParticipation}\n`;
    markdown += `- **Overall Win Rate**: ${report.summary.overallWinRate.toFixed(1)}%\n\n`;

    markdown += '## Category Performance\n\n';
    markdown += '| Category | Winner | Hyperion Rank | Performance Gap |\n';
    markdown += '|----------|--------|---------------|------------------|\n';
    
    for (const category of report.categoryAnalysis) {
      markdown += `| ${category.category} | ${category.winner} | #${category.hyperionRank} | ${category.performanceGap} |\n`;
    }

    markdown += '\n## Detailed Analysis\n\n';
    for (const category of report.categoryAnalysis) {
      markdown += `### ${category.category}\n\n`;
      markdown += `- **Winner**: ${category.winner}\n`;
      markdown += `- **Hyperion Rank**: #${category.hyperionRank}\n`;
      markdown += `- **Performance**: ${category.performanceGap}\n\n`;
      
      if (category.insights.length > 0) {
        markdown += '**Key Insights**:\n';
        category.insights.forEach(insight => {
          markdown += `- ${insight}\n`;
        });
        markdown += '\n';
      }
    }

    markdown += '## Strengths & Improvement Areas\n\n';
    
    if (report.strengthsWeaknesses.hyperionStrengths.length > 0) {
      markdown += '### ✅ Hyperion ORM Strengths\n\n';
      report.strengthsWeaknesses.hyperionStrengths.forEach(strength => {
        markdown += `- ${strength}\n`;
      });
      markdown += '\n';
    }

    if (report.strengthsWeaknesses.hyperionWeaknesses.length > 0) {
      markdown += '### ❌ Areas for Improvement\n\n';
      report.strengthsWeaknesses.hyperionWeaknesses.forEach(weakness => {
        markdown += `- ${weakness}\n`;
      });
      markdown += '\n';
    }

    markdown += '## Recommendations\n\n';
    report.recommendations.forEach((rec, index) => {
      markdown += `${index + 1}. ${rec}\n`;
    });

    return markdown;
  }
}